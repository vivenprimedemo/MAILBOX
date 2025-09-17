import { logger } from '../config/logger.js';
import { config } from '../config/index.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { consoleHelper } from '../../consoleHelper.js';

// ----------- Initialize SDKs --------------
const googleClient = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.OAUTH_REDIRECT_URI
);

const msalClient = new ConfidentialClientApplication({
    auth: {
        clientId: config.OUTLOOK_CLIENT_ID,
        authority: `https://login.microsoftonline.com/common`,
        clientSecret: config.OAUTH_REDIRECT_URI,
    },
});


// ----------- Controller --------------
export class OauthController {

    static async getAuthorizationUrl(req, res) {
        try {
            const { provider, service } = req.params;
            const { payload, response_type = 'json' } = req.body;
    
            if(!config.SCOPE_MAP[provider]?.[service]){
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_PROVIDER_OR_SERVICE',
                        message: `Invalid provider or service: ${provider}/${service}`,
                        timestamp: new Date()
                    },
                });
            }
    
            const statePayload = {
                ...payload,
                provider,
                service,
                response_type,
                nonce: crypto.randomBytes(8).toString('hex'),
            }

            const state = jwt.sign(statePayload, config.OAUTH_STATE_SECRET, {expiresIn: config.OAUTH_STATE_EXPIRES_IN});

            let authUrl;
            if (provider === 'google') {
                authUrl = googleClient.generateAuthUrl({
                    scope: config.SCOPE_MAP[provider][service],
                    access_type: 'offline',
                    prompt: 'consent',
                    state: state ?? undefined,
                });
            } else if (provider === 'outlook') {
                authUrl = await msalClient.getAuthCodeUrl({
                    scopes: config.SCOPE_MAP[provider][service],
                    redirectUri: config.OUTLOOK_REDIRECT_URI,
                    prompt: 'consent',
                    state,
                })
            } else {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_PROVIDER',
                        message: `Invalid provider: ${provider}`,
                        timestamp: new Date()
                    },
                });
            }
    
            return res.status(200).json({
                success: true,
                data: { authUrl },
            });
        } catch (error) {
            logger.error('Failed to generate authorization URL', { error: error.message, stack: error.stack, provider: req.params.provider, service: req.params.service });
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // ----------- Handle callbacks --------------
    static async handleCallback(req, res) {
        logger.info("callback received")
        try {
            const { code, state, error: authError } = req.query;

            if (authError) {
                logger.error('OAuth authorization error', { error: authError });
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'OAUTH_AUTHORIZATION_ERROR',
                        message: `Authorization failed: ${authError}`,
                    }
                });
            }

            if (!code || !state) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_CALLBACK_PARAMETERS',
                        message: 'Missing required callback parameters: code or state',
                    }
                });
            }

            // Decode and validate state
            let stateData;
            try {
                stateData = jwt.verify(state, config.OAUTH_STATE_SECRET);
                consoleHelper('Received OAuth state payload:', stateData);
            } catch (stateError) {
                logger.error('Invalid OAuth state', { error: stateError.message });
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_OAUTH_STATE',
                        message: 'Invalid or expired OAuth state',
                    }
                });
            }

            const { provider, service, response_type = 'json' } = stateData;

            // Validate provider and service combination
            if (!config.SCOPE_MAP[provider]?.[service]) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_PROVIDER_SERVICE_COMBINATION',
                        message: `Invalid provider/service combination: ${provider}/${service}`,
                    }
                });
            }

            // Exchange authorization code for tokens
            const tokenData = await OauthController.exchangeCodeForTokens(
                provider,
                service,
                code,
                stateData
            );

            // Get user profile information
            const userProfile = await OauthController.getUserProfile(
                provider,
                tokenData.access_token
            );

            // Extract the original payload from stateData (excluding OAuth-specific fields)
            const { provider: _, service: __, nonce, ...originalPayload } = stateData;

            // Log the complete payload received in callback
            consoleHelper('Complete OAuth callback payload:', {
                originalPayload,
                provider,
                service,
                userProfile: {
                    id: userProfile?.id,
                    email: userProfile?.email,
                    name: userProfile?.name
                }
            });

            // Prepare response data
            const responseData = {
                provider,
                service,
                tokens: tokenData,
                userProfile,
                originalPayload,  // Include the original payload in response
                stateData: {
                    ...stateData,
                    // Remove sensitive data from response
                    iat: undefined,
                    exp: undefined,
                    nonce: undefined
                }
            };

            // Execute post-processing tasks asynchronously
            OauthController.postProcess(responseData).catch(error => {
                logger.error('Post-processing failed', {
                    error: error.message,
                    provider,
                    service,
                    userId: userProfile?.id
                });
            });

            logger.info(`OAuth callback successful for ${provider}/${service}`, {
                provider,
                service,
                userId: userProfile?.id,
                email: userProfile?.email,
                response_type
            });

            // Handle different response types
            if (response_type === 'postMessage') {
                return OauthController.sendPostMessageResponse(res, responseData);
            } else {
                return res.status(200).json({
                    success: true,
                    data: responseData,
                    error: null,
                    metadata: {
                        timestamp: new Date(),
                        provider,
                        service
                    }
                });
            }

        } catch (error) {
            logger.error('OAuth callback failed', {
                error: error.message,
                stack: error.stack,
                query: req.query
            });

            // Check if we need to handle error with postMessage
            let response_type = 'json';
            try {
                if (req.query.state) {
                    const stateData = jwt.verify(req.query.state, config.OAUTH_STATE_SECRET);
                    response_type = stateData.response_type || 'json';
                }
            } catch (stateError) {
                // If state parsing fails, default to JSON
            }

            const errorResponse = {
                success: false,
                error: {
                    code: 'OAUTH_CALLBACK_ERROR',
                    message: 'Internal server error during OAuth callback',
                    timestamp: new Date()
                }
            };

            if (response_type === 'postMessage') {
                return OauthController.sendPostMessageErrorResponse(res, errorResponse);
            } else {
                return res.status(500).json(errorResponse);
            }
        }
    }

    static async exchangeCodeForTokens(provider, service, code, stateData) {
        try {
            let tokenData;

            if (provider === 'google') {
                const { tokens } = await googleClient.getToken(code);
                tokenData = {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_in: tokens.expiry_date,
                    token_type: 'Bearer',
                    scope: tokens.scope
                };
            } else if (provider === 'microsoft') {
                const tokenRequest = {
                    code,
                    scopes: config.SCOPE_MAP.microsoft[service],
                    redirectUri: config.OUTLOOK_REDIRECT_URI
                };

                const response = await msalClient.acquireTokenByCode(tokenRequest);
                tokenData = {
                    access_token: response.accessToken,
                    refresh_token: response.refreshToken,
                    expires_in: response.expiresOn,
                    token_type: 'Bearer',
                    scope: response.scopes?.join(' ')
                };
            } else {
                throw new Error(`Unsupported provider: ${provider}`);
            }

            return tokenData;
        } catch (error) {
            logger.error(`Token exchange failed for ${provider}/${service}`, {
                error: error.message,
                provider,
                service
            });
            throw new Error(`Failed to exchange authorization code for tokens: ${error.message}`);
        }
    }

    /**
     * Get user profile information from the provider
     * @param {string} provider - OAuth provider
     * @param {string} accessToken - Access token
     * @returns {Promise<Object>} User profile data
     */
    static async getUserProfile(provider, accessToken) {
        try {
            let userProfile;

            if (provider === 'google') {
                const oauth2 = google.oauth2({ version: 'v2', auth: googleClient });
                googleClient.setCredentials({ access_token: accessToken });
                const { data } = await oauth2.userinfo.get();

                userProfile = {
                    id: data.id,
                    email: data.email,
                    name: data.name,
                    picture: data.picture,
                    verified_email: data.verified_email
                };
            } else if (provider === 'microsoft') {
                // Use Microsoft Graph API to get user profile
                const response = await fetch('https://graph.microsoft.com/v1.0/me', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Microsoft Graph API error: ${response.status}`);
                }

                const data = await response.json();
                userProfile = {
                    id: data.id,
                    email: data.mail || data.userPrincipalName,
                    name: data.displayName,
                    picture: null, // Would need separate call to get photo
                    verified_email: true
                };
            } else {
                throw new Error(`Unsupported provider: ${provider}`);
            }

            return userProfile;
        } catch (error) {
            logger.error(`Failed to get user profile for ${provider}`, {
                error: error.message,
                provider
            });
            throw new Error(`Failed to get user profile: ${error.message}`);
        }
    }

    /**
     * Post-process OAuth callback data - perform async tasks after successful authentication
     * @param {Object} data - OAuth callback data including tokens, user profile, and state
     * @returns {Promise<void>}
     */
    static async postProcess(data) {
        try {
            const { provider, service, tokens, userProfile, stateData } = data;

            logger.info(`Starting post-processing for ${provider}/${service}`, {
                provider,
                service,
                userId: userProfile?.id,
                email: userProfile?.email
            });

            // Service-specific post-processing
            switch (service) {
                case 'gmail':
                case 'outlook':
                    await OauthController.processEmailService({
                        provider,
                        tokens,
                        userProfile,
                        stateData
                    });
                    break;

                case 'calendar':
                    await OauthController.processCalendarService({
                        provider,
                        tokens,
                        userProfile,
                        stateData
                    });
                    break;

                default:
                    logger.warn(`No post-processing defined for service: ${service}`);
            }

            logger.info(`Post-processing completed for ${provider}/${service}`, {
                provider,
                service,
                userId: userProfile?.id
            });

        } catch (error) {
            logger.error('Post-processing error', {
                error: error.message,
                stack: error.stack,
                provider: data?.provider,
                service: data?.service
            });
            // Don't throw - post-processing failures shouldn't affect the main OAuth flow
        }
    }

    /**
     * Process email service OAuth data (Gmail, Outlook)
     * @param {Object} params - Processing parameters
     * @returns {Promise<void>}
     */
    static async processEmailService({ provider, tokens, userProfile, stateData }) {
        try {
            logger.info(`Processing email service for ${provider}`, {
                provider,
                userId: userProfile?.id,
                email: userProfile?.email
            });

            // TODO: Implement email service processing
            // - Save email configuration to database
            // - Set up webhooks if needed
            // - Initialize email sync
            // - Update user account with email access

            // Example implementation placeholder:
            // await EmailConfigService.createOrUpdate({
            //     userId: stateData.userId,
            //     provider,
            //     email: userProfile.email,
            //     tokens,
            //     userProfile
            // });

            logger.info(`Email service processing completed for ${provider}`);
        } catch (error) {
            logger.error(`Email service processing failed for ${provider}`, {
                error: error.message,
                provider,
                userId: userProfile?.id
            });
            throw error;
        }
    }

    /**
     * Process calendar service OAuth data
     * @param {Object} params - Processing parameters
     * @returns {Promise<void>}
     */
    static async processCalendarService({ provider, tokens, userProfile, stateData }) {
        try {
            logger.info(`Processing calendar service for ${provider}`, {
                provider,
                userId: userProfile?.id,
                email: userProfile?.email
            });
            // TODO: Implement calendar service processing
            // - Save calendar configuration to database
            // - Set up calendar webhooks
            // - Initialize calendar sync
            // - Update user account with calendar access

            // Example implementation placeholder:
            // await CalendarConfigService.createOrUpdate({
            //     userId: stateData.userId,
            //     provider,
            //     email: userProfile.email,
            //     tokens,
            //     userProfile
            // });

            logger.info(`Calendar service processing completed for ${provider}`);
        } catch (error) {
            logger.error(`Calendar service processing failed for ${provider}`, {
                error: error.message,
                provider,
                userId: userProfile?.id
            });
            throw error;
        }
    }

    /**
     * Send response via window.opener.postMessage for popup-based OAuth flows
     * @param {Object} res - Express response object
     * @param {Object} responseData - OAuth callback data
     * @returns {void}
     */
    static sendPostMessageResponse(res, responseData) {
        const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>OAuth Callback</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f5f5f5;
                }
                .container {
                    text-align: center;
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .success {
                    color: #28a745;
                }
                .spinner {
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 2s linear infinite;
                    margin: 0 auto 1rem;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="spinner"></div>
                <h2 class="success">✓ Authorization Successful</h2>
                <p>Processing your authentication...</p>
                <p><small>This window will close automatically.</small></p>
            </div>

            <script>
                (function() {
                    try {
                        const responseData = ${JSON.stringify(responseData)};

                        // Log the data being sent
                        console.log('OAuth callback data:', responseData);

                        // Send data to parent window
                        if (window.opener && !window.opener.closed) {
                            window.opener.postMessage({
                                type: 'OAUTH_CALLBACK',
                                success: true,
                                data: responseData,
                                timestamp: new Date().toISOString()
                            }, '*');

                            // Close the popup after a short delay
                            setTimeout(() => {
                                window.close();
                            }, 1500);
                        } else {
                            console.error('Parent window not found or closed');
                            document.querySelector('.container').innerHTML =
                                '<h2 style="color: #dc3545;">✗ Error</h2><p>Parent window not found. Please close this window and try again.</p>';
                        }
                    } catch (error) {
                        console.error('PostMessage error:', error);

                        // Send error to parent window if possible
                        if (window.opener && !window.opener.closed) {
                            window.opener.postMessage({
                                type: 'OAUTH_CALLBACK',
                                success: false,
                                error: {
                                    code: 'POSTMESSAGE_ERROR',
                                    message: error.message,
                                    timestamp: new Date().toISOString()
                                }
                            }, '*');
                        }

                        document.querySelector('.container').innerHTML =
                            '<h2 style="color: #dc3545;">✗ Error</h2><p>Failed to process authentication. Please close this window and try again.</p>';
                    }
                })();
            </script>
        </body>
        </html>`;

                res.setHeader('Content-Type', 'text/html');
                return res.status(200).send(htmlResponse);
            }

            /**
             * Send error response via window.opener.postMessage for popup-based OAuth flows
             * @param {Object} res - Express response object
             * @param {Object} errorResponse - Error response data
             * @returns {void}
             */
            static sendPostMessageErrorResponse(res, errorResponse) {
                const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>OAuth Error</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f5f5f5;
                }
                .container {
                    text-align: center;
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .error {
                    color: #dc3545;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2 class="error">✗ Authorization Failed</h2>
                <p>There was an error during authentication.</p>
                <p><small>This window will close automatically.</small></p>
            </div>

            <script>
                (function() {
                    try {
                        const errorData = ${JSON.stringify(errorResponse)};

                        // Log the error
                        console.error('OAuth callback error:', errorData);

                        // Send error to parent window
                        if (window.opener && !window.opener.closed) {
                            window.opener.postMessage({
                                type: 'OAUTH_CALLBACK',
                                success: false,
                                ...errorData,
                                timestamp: new Date().toISOString()
                            }, '*');

                            // Close the popup after a short delay
                            setTimeout(() => {
                                window.close();
                            }, 3000);
                        } else {
                            console.error('Parent window not found or closed');
                        }
                    } catch (error) {
                        console.error('PostMessage error handling failed:', error);
                    }
                })();
            </script>
        </body>
        </html>`;

        res.setHeader('Content-Type', 'text/html');
        return res.status(500).send(htmlResponse);
    }
}
import { consoleHelper } from "../../consoleHelper.js";
import { payloadService } from "../services/payload.js";
import { EmailConfig } from "../models/Email.js";
import { config } from "../config/index.js";
import logger from "../utils/logger.js";
import constant from "../utils/constants.js";

export const emailProcesses = {

    async handleCreateContact({
        payloadToken,
        contactEmailAddress,
        contactName,
        emailMessage,
        emailConfig
    }) {
        try {
            const contacts = await payloadService.find(payloadToken, 'contacts', {
                queryParams: [`where[email][equals]=${normalizeEmail(contactEmailAddress)}`],
                depth: 0
            })

            if (contacts?.length > 0) {
                return contacts?.[0];
            }

            //split name and last name from the email addresswe have create the first name and last name from the email address
            const { firstName, lastName } = normalizeName(contactName, contactEmailAddress);
            const contactPayload = {
                email: normalizeEmail(contactEmailAddress),
                first_name: firstName,
                last_name: lastName,
                crm_tenant: [emailConfig?.company_id],
            };

            const response = await payloadService.create(payloadToken, "contacts", contactPayload);
            const createdContact = response?.data?.doc;

            //  create contact creation activity
            emailProcesses.handleContactCreationActivity({
                payloadToken,
                associatedContact: createdContact,
                emailMessage,
                emailConfig
            })

            return createdContact;
        } catch (error) {
            logger.error("Error creating contact", error)
            return null;
        }
    },

    async handleCreateActivity({
        payloadToken,
        emailMessage,
        associatedContacts,
        associatedTickets,
        direction,
        emailConfig,
    }) {
        try {
            const activityPayload = {
                name: `Email Activity`,
                event: "interaction",
                key: direction === "RECEIVED" ? constant.activity.received : constant.activity.sent,
                // performed_by: "66c5775a4cf9070e0378389d", // support's userId
                entity_type: "contacts",
                association: {
                    contacts: associatedContacts?.map(contact => contact?.id),
                    tickets: associatedTickets?.length > 0 ? associatedTickets?.map(ticket => ticket?.id) : [],
                },
                module: {
                    name: "emails"
                },
                email: {
                    id: emailMessage?.id,
                    messageId: emailMessage?.messageId,
                    threadId: emailMessage?.threadId,
                    subject: emailMessage?.subject,
                    from: emailMessage?.from,
                    to: emailMessage?.to,
                    cc: emailMessage?.cc,
                    bcc: emailMessage?.bcc,
                    accountId: emailConfig?._id,
                    email: emailConfig?.email,
                    type: direction,
                },
                company_id: emailConfig?.company_id,
            }
            const res = await payloadService.create(payloadToken, "activity_logs", activityPayload);
            return res;
        } catch (error) {
            logger.error("Error creating activity", error)
            return null;
        }
    },

    async handleFetchAssociatedDeals({
        payloadToken,
        contactFromId,
        contactToId
    }) {
        try {
            const queryParams = [
                `where[or][0][and][0][from.objectId][equals]=${contactFromId}`,
                `where[or][1][and][0][to.objectId][equals]=${contactToId}`,
                `where[or][2][and][0][from.objectId][equals]=${contactToId}`,
                `where[or][3][and][0][to.objectId][equals]=${contactFromId}`,
            ]
            const deals = await payloadService.find(payloadToken, 'crm_associations', {
                queryParams: queryParams
            })
            return deals;
        } catch (error) {
            consoleHelper("deals find error", error)
            return null;
        }
    },

    async handleIsEmailNeverLogged({
        payloadToken,
        emailMessage,
        emailConfigId
    }) {

        const ignoreVal = emailMessage?.ignoreMessage
        if (ignoreVal === true || ignoreVal === "true") {
            return true;
        }

        const to = emailMessage?.to?.[0]?.address || "";
        const from = emailMessage?.from?.address || "";

        const emailConfig = await EmailConfig.findOne({ _id: emailConfigId }, { company_id: 1, user_id: 1 });

        const toPresentInConfig = await EmailConfig.findOne({ email: to }, { is_active: 1 }) || { is_active: false };
        const fromPresentInConfig = await EmailConfig.findOne({ email: from }, { is_active: 1 }) || { is_active: false };

        const condition = {
            company_id: emailConfig?.company_id,
            $or: [
                { user_id: emailConfig?.user_id },
                { user_id: null }
            ]
        }
        const formBuilderResponse = await fetch(`${config.API_BASE_URL}/api/get-specific-field-of-collection`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${payloadToken}`
            },
            body: JSON.stringify({
                collection: 'email_logging',
                condition: condition,
                fields: ['emails', 'domains']
            })
        }).then((res) => res.json() || []).then(d => d?.data || []).catch(e => []);



        // Safe array helper
        const safeArray = (val) => (Array.isArray(val) ? val : []);

        // Merge emails + domains from config
        const neverlogEmails = [
            ...safeArray(formBuilderResponse?.flatMap(log => log?.emails || [])),
            ...safeArray(formBuilderResponse?.flatMap(log => log?.domains || [])),
        ];

        // Helper: check if an email matches list (exact or domain)
        const matchesList = (email, list) => {
            if (!email || !Array.isArray(list)) return false;

            return list.some((entry) => {
                const lowerEntry = entry.toLowerCase();
                const lowerEmail = email.toLowerCase();

                if (!lowerEntry.includes("@")) {
                    // treat as domain (e.g. "gmail.com")
                    return lowerEmail.endsWith(`@${lowerEntry}`);
                } else if (lowerEntry.startsWith("*@")) {
                    // wildcard domain (e.g. "*@gmail.com")
                    const domain = lowerEntry.slice(2);
                    return lowerEmail.endsWith(`@${domain}`);
                } else {
                    // exact email
                    return lowerEmail === lowerEntry;
                }
            });
        };

        if (toPresentInConfig?.is_active && fromPresentInConfig?.is_active) {
            return false;
        }

        // Otherwise apply blocklist
        const isNeverLogged =
            matchesList(to, neverlogEmails) || matchesList(from, neverlogEmails);

        return isNeverLogged;
    },

    async handleFindMessageOwner({
        payloadToken,
        emailMessage,
        direction
    }) {
        let emails = [];
        if (direction === "RECEIVED") {
            emails = [
                ...emailMessage?.to?.map(to => to?.address),
                ...emailMessage?.cc?.map(cc => cc?.address),
                ...emailMessage?.bcc?.map(bcc => bcc?.address),
            ];

        } else {
            emails.push(emailMessage?.from?.address)
        }
        console.log("email activity performed by : ", emails)
        try {
            const user = await payloadService.find(payloadToken, 'users', {
                queryParams: [`where[email][in]=${emails.join(',')}`],
                depth: 0
            })
            consoleHelper("handleFindMessageOwner", user)
            return user?.data;
        } catch (error) {
            consoleHelper("user find error", error)
            return null;
        }
    },

    async handleContactCreationActivity({
        payloadToken,
        associatedContact,
        emailMessage,
        emailConfig
    }) {
        const activityPayload = {
            name: "Contact Created By Email",
            event: "create",
            key: "contact_created_by_email",
            // performed_by: "66c5775a4cf9070e0378389d", // support's userId
            company_id: emailConfig?.company_id,
            entity_type: "contacts",
            entity: {
                contacts: associatedContact?.id
            },
            association: {
                contacts: [associatedContact?.id],
            },
            module: {
                name: "emails"
            },
            email: {
                id: emailMessage?.id,
                messageId: emailMessage?.messageId,
                threadId: emailMessage?.threadId,
                subject: emailMessage?.subject,
                from: emailMessage?.from,
                to: emailMessage?.to,
                cc: emailMessage?.cc,
                bcc: emailMessage?.bcc,
                accountId: emailConfig?._id,
                type: emailMessage?.direction ?? "SENT",
            },
        }
        const res = await payloadService.create(payloadToken, "activity_logs", activityPayload);
        consoleHelper("contact created activity", res)
        return res;
    },

    async handleCreateTicket({
        payloadToken,
        associatedContact,
        emailMessage,
        emailConfig,
        direction
    }) {
        try {

            if(direction !== "RECEIVED"){
                consoleHelper("Skipped Ticket creation as direction is not received | direction : ", direction)
                return null;
            }

            // Get config/defaults for the ticket
            let ticketConfig = await payloadService.find(payloadToken, 'ticket_configs', {
                queryParams: [
                    `where[is_active][equals]=true`,
                    `where[company_id][equals]=${emailConfig?.company_id}`,
                    `where[channel_id][equals]=${emailConfig?._id || emailConfig?.id}`
                ],
                depth: 0,
                returnSingle: true
            })

            // Check if ticketConfig is valid and active
            if (!ticketConfig || (Array.isArray(ticketConfig) && ticketConfig.length === 0) || !ticketConfig.is_active) {
                consoleHelper("Skipped Ticket creation ", ticketConfig)
                return null;
            }

            // Create ticket
            const ticketPayload = {
                title: emailMessage?.subject || 'No Subject',
                description: emailMessage?.snippet || emailMessage?.bodyText || emailMessage?.bodyHtml || '',
                crm_tenant: [emailConfig?.company_id],
                pipeline_id: ticketConfig?.pipeline_id,
                stage_id: ticketConfig?.stage_id,
                email: emailMessage?.from?.address,
                conversation_id: emailMessage?.conversationId,
                all_internet_message_ids: [ emailMessage?.internetMessageId ],
                priority: ticketConfig?.priority,
                assigned_to: ticketConfig?.assigned_to?.[0],
                source: 'email',
                direction: direction || 'inbound',
                last_email_activity: 'ORIGINAL_FROM_CONTACT',
                in_helpdesk:false,
                last_email_date: new Date()
            }

            const createdTicketRes = await payloadService.create(payloadToken, "tickets", ticketPayload);

            // Create ticket activity
            const ticketCreateActivity = await emailProcesses.handleCreateTicketActivityLog({
                payloadToken,
                ticket: createdTicketRes?.data?.doc,
                contact: associatedContact,
                companyId: emailConfig?.company_id,
                userId: emailConfig?.support_user_id || "66c5775a4cf9070e0378389d", // support's userId
            })

            if (!ticketCreateActivity) {
                consoleHelper("Warning: Ticket activity log creation failed for ticket", createdTicketRes?.data?.doc?.id)
            }

            // Create ticket associations
            const ticketAssociationRes = await emailProcesses.handleCreateTicketAssociations({
                payloadToken,
                ticketId: createdTicketRes?.data?.doc?.id,
                contactId: associatedContact?.id,
                companyId: emailConfig?.company_id,
                userId: emailConfig?.support_user_id || "66c5775a4cf9070e0378389d", // support's userId
            })

            if (!ticketAssociationRes) {
                consoleHelper("Warning: Ticket association creation failed for ticket", createdTicketRes?.data?.doc?.id)
            }

            return createdTicketRes?.data?.doc;
            
        } catch (error) {
            console.error("Error handleCreateTicket:", error)
            return null;
        }
    },

    async handleCreateTicketActivityLog({
        payloadToken,
        ticket,
        contact,
        companyId,
        userId,
    }) {
        try {
            const activityLogData = {
                name: 'Ticket Created by Email',
                event: constant.TYPE.CREATE,
                key: constant.KEYS.TICKET_CREATED_BY_EMAIL,
                performed_by: userId,
                entity_type: 'tickets',
                entity: {
                    tickets: ticket.id,
                },
                association: {
                    tickets: [ticket.id],
                    // contacts: contact?.id ? [contact.id] : []
                },
                company_id: companyId,
                meta_data: {
                    ticket_id: ticket.id,
                    ticket_title: ticket.title,
                    source: 'email',
                    direction: contact ? 'inbound' : 'outbound',
                },
            };

            const createdActivity = await payloadService.create(payloadToken, "activity_logs", activityLogData);
            return createdActivity;
        } catch (error) {
            console.error('Error handleCreateTicketActivityLog:', error);
            return null;
        }
    },

    async handleCreateTicketAssociations({
        payloadToken,
        ticketId,
        contactId,
        companyId,
    }) {
        try {
            const associations = [];

            // Handle contact association if contact exists
            if (contactId) {
                associations.push(
                    payloadService.create(payloadToken, "crm_associations", {
                        from: {
                            objectId: ticketId,
                            objectType: 'ticket',
                            refId: ticketId,
                        },
                        to: {
                            objectId: contactId,
                            objectType: 'contact',
                            refId: contactId,
                        },
                        associationType: 'ticket_to_contact',
                        crm_tenant: [companyId],
                    })
                );
            }

            // Handle company association using the form's company ID
            if (companyId) {
                associations.push(
                    payloadService.create(payloadToken, "crm_associations", {
                        from: {
                            objectId: ticketId,
                            objectType: 'ticket',
                            refId: ticketId,
                        },
                        to: {
                            objectId: companyId,
                            objectType: 'company',
                            refId: companyId,
                        },
                        associationType: 'ticket_to_company',
                        crm_tenant: [companyId],
                    })
                );
            }

            // Execute all associations in parallel
            if (associations.length > 0) {
                const createdAssociation = await Promise.all(associations);
                return createdAssociation;
            }

            // Return empty array if no associations were needed
            return [];
        } catch (error) {
            console.error('Error handleCreateTicketAssociations:', error);
            return null;
        }
    },
}

export async function handleIsFromTheSameTicket({
    payloadToken,
    emailMessage,
    direction
}) {
    try {
        const queryParams = [];
        let orIndex = 0;

        // OR condition: conversationId
        if (emailMessage?.conversationId) {
            queryParams.push(`where[or][${orIndex}][conversation_id][equals]=${emailMessage.conversationId}`);
            orIndex++;
        }

        // OR condition: inReplyTo header
        if (emailMessage?.inReplyTo) {
            queryParams.push(`where[or][${orIndex}][all_internet_message_ids][in]=${emailMessage.inReplyTo}`);
            orIndex++;
        }

        // OR conditions: each reference in references array
        if (emailMessage?.references && Array.isArray(emailMessage.references)) {
            emailMessage.references.forEach((reference) => {
                if (reference) {
                    queryParams.push(`where[or][${orIndex}][all_internet_message_ids][in]=${reference}`);
                    orIndex++;
                }
            });
        }

        console.log('handleIsFromTheSameTicket query:', { subject: emailMessage?.subject, orConditions: orIndex, queryParams });

        const isFromTheSameTicket = await payloadService.find(payloadToken, 'tickets', {
            queryParams,
            depth: 0,
            returnSingle: true
        })

        // If ticket found, update it with new internetMessageId, last_activity, and last_email_date
        if (isFromTheSameTicket && emailMessage?.internetMessageId) {
            const existingMessageIds = isFromTheSameTicket.all_internet_message_ids || [];

            // Determine last_activity based on direction
            console.log('handleIsFromTheSameTicket direction:', direction);
            const lastActivity = direction === 'SENT' ? 'SENT_TO_CONTACT' : 'REPLY_FROM_CONTACT';

            const updatePayload = {
                last_email_activity: lastActivity,
                last_email_date: new Date()
            };

            // Only add internetMessageId if not already present
            if (!existingMessageIds.includes(emailMessage.internetMessageId)) {
                updatePayload.all_internet_message_ids = [...existingMessageIds, emailMessage.internetMessageId];
            }

            await payloadService.update(
                payloadToken,
                'tickets',
                isFromTheSameTicket.id,
                updatePayload
            );
        }

        return isFromTheSameTicket;
    } catch (error) {
        console.error('Error handleIsFromTheSameTicket:', error);
        return null;
    }
}

export function normalizeEmail(email) {
    if (!email) return '';
    return email.toString().toLowerCase().replace(/\s/g, '');
}

export function normalizeName(name , email) {
    const nameFromEmail = email?.split('@')[0];
    const firstName = name?.split(' ')[0] || nameFromEmail?.split('.')[0] || email?.split('@')[0];
    const lastName = name?.split(' ')[1] || nameFromEmail?.split('.')[1] || '';
    return {
        firstName,
        lastName
    }
}
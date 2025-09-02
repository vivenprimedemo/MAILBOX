import { config } from "../config/index.js";
import { restApiWrapper } from "./fetch_wrapper.js";

// get config data
const apiBaseUrl = config.API_BASE_URL;

// Define functions
export const payloadService = {
    find,
    findById,
    count,
    create,
    update,
    updateAll,
    delete: _delete,
    findDelete,
    generateAdminToken
};

// Payload FIND method
async function find(accessToken, collection, { queryParams = [], sortBy = '', returnFull = false, returnSingle = false, limit = 9999999999, depth = 1, page = "" } = {}) {
    try {
        // Construct query string
        const queryString = queryParams.length ? `&${queryParams.join('&')}` : '';

        // Construct sort string
        const sortString = (sortBy) ? 'sort=' + sortBy : '&sort=-id';

        let appendParam = '';
        if (page) {
            appendParam = "&page=" + page;
        }

        // Fetch data
        const response = await restApiWrapper.get(`${apiBaseUrl}/api/${collection}/?1=1${queryString}&${sortString}&limit=${limit}&depth=${depth}${appendParam}`, {
            Authorization: `Bearer ${accessToken}`
        });

        // Return based on options
        if (returnFull) {
            return response;
        }

        return returnSingle ? response?.docs?.[0] || [] : response?.docs;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw new Error('Failed to fetch data');
    }
}

// Payload FIND BY ID method
async function findById(accessToken, collection, itemId) {
    const returnResponse = await restApiWrapper.get(`${apiBaseUrl}/api/${collection}/${itemId}`, {
        Authorization: 'Bearer ' + accessToken
    });

    return returnResponse?.docs || returnResponse;
}

// Payload COUNT method
async function count(accessToken, collection, { queryParams = [] }) {
    // Construct query string
    const queryString = queryParams.length ? `&${queryParams.join('&')}` : '';

    const returnResponse = await restApiWrapper.get(`${apiBaseUrl}/api/${collection}/count/?1=1${queryString}`, {
        Authorization: 'Bearer ' + accessToken
    });

    return returnResponse;
}

// Payload INSERT method
async function create(accessToken, collection, bodyParameters = {}) {
    try {
        // Create new item
        const response = await restApiWrapper.post(
            `${apiBaseUrl}/api/${collection}`,
            bodyParameters,
            {
                Authorization: `Bearer ${accessToken}`
            }
        );

        // Check if response is valid
        if (response?.doc?.id) {
            return {
                statusCode: 200,
                itemId: response?.doc?.id,
                data: response
            };
        } else {
            return {
                statusCode: 504,
                message: response?.errors?.[0]?.data[0]?.message ?? 'Oops! Something went wrong during creation.'
            };
        }
    } catch (error) {
        return {
            statusCode: 500,
            message: error
        };
    }
}

// Payload UPDATE method
async function update(accessToken, collection, itemId, bodyParameters = {}) {
    const returnResponse = await restApiWrapper.patch(`${apiBaseUrl}/api/${collection}/${itemId}`, bodyParameters, {
        Authorization: 'Bearer ' + accessToken
    });
    return returnResponse;
}

// Payload UPDATE method
async function updateAll(accessToken, collection, bodyParameters = {}, { queryParams = [] }) {
    // Construct query string
    const queryString = queryParams.length ? `&${queryParams.join('&')}` : '';

    const returnResponse = await restApiWrapper.patch(`${apiBaseUrl}/api/${collection}/?1=1${queryString}`, bodyParameters, {
        Authorization: 'Bearer ' + accessToken
    });
    return returnResponse;
}

// Payload DELETE method
async function _delete(accessToken, collection, itemId) {
    try {
        const returnResponse = await restApiWrapper.delete(`${apiBaseUrl}/api/${collection}/${itemId}`, {
            Authorization: 'Bearer ' + accessToken
        });
        return returnResponse;
    } catch (error) {
        return error || error?.message;
    }
}

// Payload FIND DELETE method
async function findDelete(accessToken, collection, queryParams = {}) {
    // Construct query string
    const queryString = queryParams.length ? `&${queryParams.join('&')}` : '';

    // Fetch data
    const returnResponse = await restApiWrapper.delete(`${apiBaseUrl}/api/${collection}?1=1${queryString}`, {
        Authorization: `Bearer ${accessToken}`
    });

    return returnResponse;
}

// Generate admin token
async function generateAdminToken() {

    // Send credentials to the server
    const accessToken = await restApiWrapper.post(apiBaseUrl + `/api/users/login`, {
        email: 'lasceadmin@mailinator.com',
        password: 'fvPWMIFv30C8G0Med7C44A'
    });

    // Return response
    return accessToken?.token;
}
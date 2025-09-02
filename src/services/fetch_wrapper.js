
export const restApiWrapper = {
    post,
    put,
    get,
    patch,
    delete: _delete
};

// define POST method
async function post(url, body = {}, headers = {}) {
    try {
        // Define request options
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            redirect: "follow",
            body: JSON.stringify(body)
        };

        // Make POST request
        return fetch(url, requestOptions).then(handleResponse);

    } catch (error) {
        throw error;
    }
}

// define POST method
async function put(url, body = {}, headers = {}) {
    try {
        // Define request options
        const requestOptions = {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            redirect: "follow",
            body: JSON.stringify(body)
        };

        // Make POST request
        return fetch(url, requestOptions).then(handleResponse);

    } catch (error) {
        throw error;
    }
}

async function patch(url, body = {}, headers = {}) {
    try {
        // Define request options
        const requestOptions = {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(body)
        };

        // Make POST request
        return fetch(url, requestOptions).then(handleResponse);
    } catch (error) {
        throw error;
    }
}

// define GET method
async function get(url, headers = {}) {
    try {
        // Define request options
        const requestOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            credentials: 'include'
        };

        // Make GET request
        return fetch(url, requestOptions).then(handleResponse);
    } catch (error) {
        throw error;
    }
}

function _delete(url, headers = {}) {
    const requestOptions = {
        method: 'DELETE',
        headers: headers
    };
    return fetch(url, requestOptions).then(handleResponse);
}

function handleResponse(response) {
    return response.text().then(text => {
        const data = text && JSON.parse(text);

        if (!response.ok) {
            const error = (data && data?.message) || response?.statusText;
            return Promise.reject(error);
        }

        return data;
    });
}
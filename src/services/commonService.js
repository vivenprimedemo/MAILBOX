import { config } from "../config/index.js";
import { restApiWrapper } from "./fetch_wrapper.js";

export const commonService = {
    fetch: async ({ payloadToken, collection, fields, condition, offset, limit, populate="", populate_fields="", single = false }) => {
        const payload = {
            fields,
            condition,
            offset,
            limit,
            populate,
            populate_fields,
            single,
        };
        
        return await restApiWrapper.post(
            `${config.API_BASE_URL}/api/fetch/${collection}?q=${new Date().toISOString()}`,
            payload,
            {
                Authorization: `Bearer ${payloadToken}`,
            }
        );
    }
}
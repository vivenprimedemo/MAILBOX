import { consoleHelper } from "../../consoleHelper.js";
import { payloadService } from "../services/payload.js";

export const emailProcesses = {
    async handleCreateContact(payloadToken , emailAddress) {
        const contacts = await payloadService.find(payloadToken, 'contacts', {
            queryParams: [`where[email][equals]=${emailAddress}`]
        })

        consoleHelper("contact find res", contacts)

        if(contacts?.length > 0) {
            return contacts?.[0];
        }

        const contactPayload = {
            email: emailAddress,
            first_name: emailAddress?.split('@')[0],
        };
        const response = await payloadService.create(payloadToken, "contacts", contactPayload);
        consoleHelper("contact create res", response)
        return response?.data?.doc;
    },

    async handleCreateActivity(payloadToken, emailMessage, contacts, direction, emailConfigId) {
        const activityPayload =   {
            name: `Email Activity`,
            type: "interaction",
            key: `email_${direction.toLowerCase()}_${emailMessage?.id}`,
            performed_by: "66c5775a4cf9070e0378389d",
            associations: "contacts",
            association_many: {
                contacts: contacts?.map(contact => contact?.id)
            },
            module: {
                name: "emails"
            },
            email: emailMessage,
        }

        const res = await payloadService.create(payloadToken, "activity_logs", activityPayload);
        consoleHelper("activity create res", res)
        return res;
    }
}
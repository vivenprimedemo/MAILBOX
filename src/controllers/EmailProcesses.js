import { consoleHelper } from "../../consoleHelper.js";
import { payloadService } from "../services/payload.js";
import { EmailConfig } from "../models/Email.js";
import { config } from "../config/index.js";

export const emailProcesses = {
    async handleCreateContact(payloadToken, emailAddress, contactName) {
        const contacts = await payloadService.find(payloadToken, 'contacts', {
            queryParams: [`where[email][equals]=${emailAddress}`]
        })

        consoleHelper("contact find res", contacts?.email)

        if(contacts?.length > 0) {
            return contacts?.[0];
        }

        const contactPayload = {
            email: emailAddress,
            first_name: contactName || emailAddress?.split('@')[0],
        };
        const response = await payloadService.create(payloadToken, "contacts", contactPayload);
        consoleHelper("contact create res", response?.data?.doc?.email)
        return response?.data?.doc;
    },

    async handleCreateActivity(payloadToken, emailMessage, contacts, direction, emailConfigId) {
        const activityPayload = {
            name: `Email Activity`,
            type: "interaction",
            key: `email_${direction}_${emailMessage?.id || emailMessage?.messageId}`,
            performed_by: "66c5775a4cf9070e0378389d", // support's userId
            associations: "contacts",
            association_many: {
                contacts: contacts?.map(contact => contact?.id)
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
                accountId: emailConfigId,
                type: direction,
            },
        }

        const res = await payloadService.create(payloadToken, "activity_logs", activityPayload);
        console.log("activity created id : " , res?.data?.doc?.id)
        return res;
    },


    async handleIsEmailNeverLogged(payloadToken, emailMessage, emailConfigId) {
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
    }
}
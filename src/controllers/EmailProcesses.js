import { consoleHelper } from "../../consoleHelper.js";
import { payloadService } from "../services/payload.js";
import { EmailConfig } from "../models/Email.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";

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
                queryParams: [`where[email][equals]=${contactEmailAddress}`],
                depth: 0
            })

            if (contacts?.length > 0) {
                return contacts?.[0];
            }

            const contactPayload = {
                email: contactEmailAddress,
                first_name: contactName || contactEmailAddress?.split('@')[0],
                crm_tenant: [emailConfig?.company_id],
            };

            const response = await payloadService.create(payloadToken, "contacts", contactPayload);
            const createdContact = response?.data?.doc;
            consoleHelper("contact create res", response)

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
        direction,
        emailConfig,
    }) {
        try {
            const activityPayload = {
                name: `Email Activity`,
                event: "interaction",
                key: `email_${direction}_${emailMessage?.id || emailMessage?.messageId}`,
                performed_by: "66c5775a4cf9070e0378389d", // support's userId
                entity_type: "contacts",
                association: {
                    contacts: associatedContacts?.map(contact => contact?.id),
                    // deals: deals?.map(deal => deal?.id),
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
            performed_by: "66c5775a4cf9070e0378389d", // support's userId
            company_id: emailConfig?.company_id,
            entity_type: "contacts",
            association: {
                contacts: associatedContact?.id,
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
    }
}
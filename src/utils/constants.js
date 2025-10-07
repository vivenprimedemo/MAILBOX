const constant = {
    activity: {
        sent: "email_sent",
        received: "email_received"
    },
    KEYS : {
        CONTACT_CREATED: 'contact_created',
        CONTACT_UPDATED: 'contact_updated',
        CONTACT_CREATED_BY_FORM: 'contact_created_by_form',
        CONTACT_CREATED_BY_WORKFLOW: 'contact_created_by_workflow',
        CONTACT_CREATED_BY_EMAIL: 'contact_created_by_email',
    
        DEAL_CREATED: 'deal_created',
        DEAL_UPDATED: 'deal_updated',
        DEAL_CREATED_BY_FORM: 'deal_created_by_form',
        DEAL_CREATED_BY_WORKFLOW: 'deal_created_by_workflow',
        DEAL_CREATED_BY_EMAIL: 'deal_created_by_email',
    
        NOTES_ADDED: 'notes_added_to_deals',
        NOTES_CREATED: 'notes_created',
        NOTES_UPDATED: 'notes_updated',
        NOTES_CREATED_BY_FORM: 'notes_created_by_form',
        NOTES_CREATED_BY_WORKFLOW: 'notes_created_by_workflow',
        NOTES_CREATED_BY_EMAIL: 'notes_created_by_email',
    
        TASK_ADDED: 'task_added',
        TASK_CREATED: 'task_created',
        TASK_UPDATED: 'task_updated',
        TASK_CREATED_BY_FORM: 'task_created_by_form',
        TASK_CREATED_BY_WORKFLOW: 'task_created_by_workflow',
        TASK_CREATED_BY_EMAIL: 'task_created_by_email',
    
        COMPANY_CREATED: 'company_created',
        COMPANY_UPDATED: 'company_updated',
        COMPANY_CREATED_BY_FORM: 'company_created_by_form',
        COMPANY_CREATED_BY_WORKFLOW: 'company_created_by_workflow',
        COMPANY_CREATED_BY_EMAIL: 'company_created_by_email',
    
        TICKET_CREATED: 'ticket_created',
        EMAIL_RECEIVED: 'email_received',
        EMAIL_SENT: 'email_sent',
        TICKET_UPDATED: 'ticket_updated',
        TICKET_CREATED_BY_FORM: 'ticket_created_by_form',
        TICKET_CREATED_BY_WORKFLOW: 'ticket_created_by_workflow',
        TICKET_CREATED_BY_EMAIL: 'ticket_created_by_email',
        MEETING_SCHEDULED: 'meeting_scheduled',
    },
    TYPE: {
        INTERACTION: 'interaction',
        AUTOMATION: 'automation',
        SYSTEM: 'system',
        UPDATE: 'update',
        CREATE: 'create',
        DELETE: 'delete',
        FORM_SUBMISSION: 'form_submission'
    },

    colors: {
        reset: '\x1b[0m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        red: '\x1b[31m',
        blue: '\x1b[34m',
    }
}

export default constant;
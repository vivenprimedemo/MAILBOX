// import nodemailer from 'nodemailer';

class Processors {
    constructor() {
        // this.transporter = nodemailer.createTransport({
        //   host: process.env.SMTP_HOST,
        //   port: process.env.SMTP_PORT,
        //   auth: {
        //     user: process.env.SMTP_USER,
        //     pass: process.env.SMTP_PASS,
        //   },
        // });
    }

    // --- Email processor ---
    async email(job) {
        console.log('Processing email job:', job.data);
        const { to, subject, bodyText } = job.data;
        try {

            for (let i = 0; i < 50; i++) {
                // Check if job has been cancelled
                if (await job.isActive() === false) {
                    console.log(`⚠️ Job cancelled for ${to}: ${subject}`);
                    throw new Error('Job was cancelled');
                }

                await new Promise((resolve) => setTimeout(resolve, 3000));
                console.log(`📧 Email sent to ${to}: ${subject} (part ${i + 1}/50)`);
            }

        } catch (error) {
            console.error('❌ Email failed', error);
            throw error;
        }
    }

    // --- Notification processor ---
    async notification(job) {
        const { userId, message } = job.data;
        try {
            // Replace with your real push/DB logic
            console.log(`🔔 Notification sent to user ${userId}: ${message}`);
        } catch (error) {
            console.error('❌ Notification failed', error);
            throw error;
        }
    }

    // Add more processors here
    // async sms(jobData) { ... }
}

export default Processors;

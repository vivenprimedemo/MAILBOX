import mongoose, { Schema } from 'mongoose';

const CalendarConfigSchema = new Schema({}, { strict: false });

export const CalendarConfig = mongoose.model('calendar_config', CalendarConfigSchema);
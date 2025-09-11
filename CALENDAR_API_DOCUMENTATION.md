# Google Calendar API Documentation

This document provides comprehensive documentation for the Google Calendar API integration, which is completely separate from the Gmail email integration.

## Overview

The Google Calendar API provides CRUD operations for calendar events and intelligent available slots detection. It uses separate OAuth authentication from Gmail, allowing users to connect calendar functionality independently.

## Authentication

**Important:** Calendar authentication is completely separate from Gmail authentication. Users must explicitly connect their Google Calendar account even if they already have Gmail connected.

### Required OAuth Scopes
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

## Base URL
```
http://localhost:8081/api/calendar
```

## Calendar Account Management

### 1. Get Calendar Accounts
Get all calendar accounts for a user.

**Endpoint:** `GET /accounts/:userId`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Parameters:**
- `userId` (path) - The user ID to get calendar accounts for

**Example Request:**
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     http://localhost:8081/api/calendar/accounts/507f1f77bcf86cd799439011
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "_id": "66f123e45a7b8c9d0e1f2345",
        "user_id": "507f1f77bcf86cd799439011",
        "email": "user@example.com",
        "calendar_name": "Primary Calendar",
        "provider": "google",
        "company_id": "comp_12345",
        "metadata": {
          "calendars_count": 5,
          "last_sync": "2025-09-11T10:00:00.000Z"
        },
        "is_active": true,
        "created_at": "2025-09-11T08:00:00.000Z",
        "updated_at": "2025-09-11T10:00:00.000Z"
      }
    ]
  },
  "error": null,
  "metadata": {
    "timestamp": "2025-09-11T12:00:00.000Z"
  }
}
```

### 2. Add Calendar Account
Connect a new Google Calendar account.

**Endpoint:** `POST /accounts`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "calendar_name": "Work Calendar",
  "provider": "google",
  "company_id": "comp_12345",
  "auth": {
    "access_token": "ya29.a0AfH6SMC7...",
    "refresh_token": "1//04-rN5...",
    "token_expiry": "2025-09-11T13:00:00.000Z"
  },
  "metadata": {
    "timezone": "America/New_York",
    "default_duration": 60
  }
}
```

**Example Request:**
```bash
curl -X POST \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "calendar_name": "Work Calendar",
       "provider": "google",
       "auth": {
         "access_token": "ya29.a0AfH6SMC7_example_token",
         "refresh_token": "1//04-rN5_example_refresh_token"
       }
     }' \
     http://localhost:8081/api/calendar/accounts
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "account": {
      "_id": "66f123e45a7b8c9d0e1f2345",
      "user_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "calendar_name": "Work Calendar",
      "provider": "google",
      "is_active": true,
      "created_at": "2025-09-11T12:00:00.000Z"
    }
  },
  "error": null,
  "metadata": {
    "timestamp": "2025-09-11T12:00:00.000Z"
  }
}
```

### 3. Update Calendar Account
Update an existing calendar account.

**Endpoint:** `PUT /accounts/:accountId`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "calendar_name": "Updated Calendar Name",
  "metadata": {
    "timezone": "UTC",
    "default_duration": 45
  }
}
```

**Example Request:**
```bash
curl -X PUT \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     -H "Content-Type: application/json" \
     -d '{
       "calendar_name": "Updated Work Calendar",
       "metadata": {
         "timezone": "America/Los_Angeles"
       }
     }' \
     http://localhost:8081/api/calendar/accounts/66f123e45a7b8c9d0e1f2345
```

### 4. Remove Calendar Account
Remove a calendar account.

**Endpoint:** `DELETE /accounts/:accountId`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Example Request:**
```bash
curl -X DELETE \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     http://localhost:8081/api/calendar/accounts/66f123e45a7b8c9d0e1f2345
```

## Calendar Operations

### 1. Get Calendars
Retrieve all calendars for a connected account.

**Endpoint:** `GET /accounts/:accountId/calendars`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Example Request:**
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     http://localhost:8081/api/calendar/accounts/66f123e45a7b8c9d0e1f2345/calendars
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "primary",
      "summary": "user@example.com",
      "description": "Primary calendar",
      "location": "",
      "timeZone": "America/New_York",
      "accessRole": "owner",
      "primary": true,
      "backgroundColor": "#9fc6e7",
      "foregroundColor": "#000000",
      "selected": true
    },
    {
      "id": "addressbook#contacts@group.v.calendar.google.com",
      "summary": "Contacts",
      "description": "Contacts birthdays and events",
      "timeZone": "America/New_York",
      "accessRole": "reader",
      "primary": false,
      "backgroundColor": "#92e1c0",
      "selected": false
    }
  ],
  "error": null,
  "metadata": {
    "timestamp": "2025-09-11T12:00:00.000Z"
  }
}
```

### 2. Get Events
Retrieve events from a calendar.

**Endpoint:** `GET /accounts/:accountId/events`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `calendarId` (optional) - Calendar ID (default: "primary")
- `timeMin` (optional) - Lower bound for events (ISO 8601) (default: current time)
- `timeMax` (optional) - Upper bound for events (ISO 8601)
- `maxResults` (optional) - Maximum number of events (default: 250, max: 2500)
- `orderBy` (optional) - Sort order: "startTime" or "updated" (default: "startTime")
- `singleEvents` (optional) - Whether to expand recurring events (default: false)
- `showDeleted` (optional) - Include deleted events (default: false)

**Example Request:**
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     "http://localhost:8081/api/calendar/accounts/66f123e45a7b8c9d0e1f2345/events?calendarId=primary&timeMin=2025-09-11T00:00:00Z&timeMax=2025-09-18T23:59:59Z&maxResults=100&singleEvents=true"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "event123abc",
        "summary": "Team Meeting",
        "description": "Weekly team sync meeting",
        "location": "Conference Room A",
        "start": "2025-09-11T14:00:00.000Z",
        "end": "2025-09-11T15:00:00.000Z",
        "attendees": [
          {
            "email": "user1@example.com",
            "displayName": "John Doe",
            "responseStatus": "accepted"
          },
          {
            "email": "user2@example.com",
            "displayName": "Jane Smith",
            "responseStatus": "needsAction"
          }
        ],
        "creator": {
          "email": "user@example.com",
          "displayName": "Event Creator"
        },
        "organizer": {
          "email": "user@example.com",
          "displayName": "Event Organizer"
        },
        "status": "confirmed",
        "visibility": "default",
        "iCalUID": "event123abc@google.com",
        "sequence": 0,
        "reminders": {
          "useDefault": true
        },
        "created": "2025-09-10T15:30:00.000Z",
        "updated": "2025-09-10T15:30:00.000Z",
        "htmlLink": "https://calendar.google.com/calendar/event?eid=..."
      }
    ],
    "nextPageToken": null,
    "nextSyncToken": "CPjh8..."
  },
  "error": null,
  "metadata": {
    "timestamp": "2025-09-11T12:00:00.000Z"
  }
}
```

### 3. Create Event
Create a new calendar event.

**Endpoint:** `POST /accounts/:accountId/events`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "calendarId": "primary",
  "summary": "New Meeting",
  "description": "Discussion about project requirements",
  "location": "Conference Room B",
  "start": "2025-09-12T18:00:00.000Z",
  "end": "2025-09-12T19:00:00.000Z",
  "attendees": [
    {
      "email": "attendee1@example.com",
      "displayName": "Attendee One"
    },
    {
      "email": "attendee2@example.com",
      "displayName": "Attendee Two"
    }
  ],
  "reminders": {
    "useDefault": false,
    "overrides": [
      {
        "method": "email",
        "minutes": 1440
      },
      {
        "method": "popup",
        "minutes": 15
      }
    ]
  },
  "visibility": "default",
  "guestsCanModify": false,
  "guestsCanInviteOthers": true,
  "guestsCanSeeOtherGuests": true,
  "sendUpdates": "all"
}
```

**Example Request:**
```bash
curl -X POST \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     -H "Content-Type: application/json" \
     -d '{
       "calendarId": "primary",
       "summary": "Client Presentation",
       "description": "Quarterly business review with client",
       "location": "Client Office - Meeting Room 1",
       "start": "2025-09-12T18:00:00.000Z",
       "end": "2025-09-12T20:00:00.000Z",
       "attendees": [
         {
           "email": "client@example.com",
           "displayName": "Client Representative"
         }
       ]
     }' \
     http://localhost:8081/api/calendar/accounts/66f123e45a7b8c9d0e1f2345/events
```

### 4. Update Event
Update an existing calendar event.

**Endpoint:** `PUT /accounts/:accountId/events/:eventId`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "calendarId": "primary",
  "summary": "Updated Meeting Title",
  "description": "Updated meeting description",
  "start": "2025-09-12T19:00:00.000Z",
  "end": "2025-09-12T20:30:00.000Z",
  "sendUpdates": "all"
}
```

**Example Request:**
```bash
curl -X PUT \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     -H "Content-Type: application/json" \
     -d '{
       "calendarId": "primary",
       "summary": "Updated Client Presentation",
       "location": "Virtual Meeting - Zoom",
       "start": "2025-09-12T19:00:00.000Z",
       "end": "2025-09-12T21:00:00.000Z"
     }' \
     http://localhost:8081/api/calendar/accounts/66f123e45a7b8c9d0e1f2345/events/event123abc
```

### 5. Delete Event
Delete a calendar event.

**Endpoint:** `DELETE /accounts/:accountId/events/:eventId`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `calendarId` (optional) - Calendar ID (default: "primary")
- `sendUpdates` (optional) - Whether to send updates to attendees: "all", "externalOnly", "none" (default: "all")

**Example Request:**
```bash
curl -X DELETE \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     "http://localhost:8081/api/calendar/accounts/66f123e45a7b8c9d0e1f2345/events/event123abc?calendarId=primary&sendUpdates=all"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "eventId": "event123abc"
  },
  "error": null,
  "metadata": {
    "timestamp": "2025-09-11T12:00:00.000Z"
  }
}
```

## Available Slots Detection

### Get Available Slots
Intelligently detect available time slots in a calendar.

**Endpoint:** `GET /accounts/:accountId/available-slots`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `calendarId` (optional) - Calendar ID (default: "primary")
- `timeMin` (optional) - Start time for slot search (ISO 8601) (default: current time)
- `timeMax` (optional) - End time for slot search (ISO 8601) (default: 7 days from now)
- `duration` (optional) - Slot duration in minutes (default: 60)
- `workingHoursStart` (optional) - Working hours start time (HH:MM format) (default: "09:00")
- `workingHoursEnd` (optional) - Working hours end time (HH:MM format) (default: "17:00")
- `timeZone` (optional) - Timezone for calculations (default: "UTC")

**Example Request:**
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     "http://localhost:8081/api/calendar/accounts/66f123e45a7b8c9d0e1f2345/available-slots?calendarId=primary&timeMin=2025-09-11T00:00:00Z&timeMax=2025-09-18T23:59:59Z&duration=60&workingHoursStart=09:00&workingHoursEnd=17:00&timeZone=America/New_York"
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "availableSlots": [
      {
        "start": "2025-09-11T09:00:00.000Z",
        "end": "2025-09-11T10:00:00.000Z",
        "duration": 60
      },
      {
        "start": "2025-09-11T11:00:00.000Z",
        "end": "2025-09-11T12:00:00.000Z",
        "duration": 60
      },
      {
        "start": "2025-09-11T13:00:00.000Z",
        "end": "2025-09-11T14:00:00.000Z",
        "duration": 60
      },
      {
        "start": "2025-09-11T15:00:00.000Z",
        "end": "2025-09-11T16:00:00.000Z",
        "duration": 60
      }
    ],
    "busySlots": [
      {
        "start": "2025-09-11T10:00:00.000Z",
        "end": "2025-09-11T11:00:00.000Z"
      },
      {
        "start": "2025-09-11T14:00:00.000Z",
        "end": "2025-09-11T15:00:00.000Z"
      }
    ],
    "duration": 60,
    "workingHours": {
      "start": "09:00",
      "end": "17:00"
    },
    "timeZone": "America/New_York"
  },
  "error": null,
  "metadata": {
    "timestamp": "2025-09-11T12:00:00.000Z"
  }
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "provider": "google",
    "timestamp": "2025-09-11T12:00:00.000Z"
  },
  "metadata": {}
}
```

### Common Error Codes

- `PROVIDER_INITIALIZATION_FAILED` - Calendar provider could not be initialized
- `CALENDAR_CONNECTION_FAILED` - Failed to connect to Google Calendar
- `INVALID_CALENDAR_CONFIG` - Missing required configuration fields
- `CALENDAR_ACCOUNT_NOT_FOUND` - Calendar account not found for user
- `GET_CALENDARS_ERROR` - Failed to retrieve calendars
- `GET_EVENTS_ERROR` - Failed to retrieve events
- `CREATE_EVENT_ERROR` - Failed to create event
- `UPDATE_EVENT_ERROR` - Failed to update event
- `DELETE_EVENT_ERROR` - Failed to delete event
- `GET_AVAILABLE_SLOTS_ERROR` - Failed to calculate available slots

## Rate Limiting

The Calendar API inherits the same rate limiting as the main application:
- General API: 100 requests per 15 minutes
- Authentication endpoints: 5 requests per 15 minutes

## Integration Notes

### Separation from Gmail
- Calendar and Gmail integrations are completely separate
- Each requires independent OAuth authentication
- Calendar accounts are stored in `calendar_config` collection
- Email accounts are stored in `email_config` collection

### OAuth Scopes Required
When setting up Google OAuth for calendar integration, ensure these scopes are included:
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

### Working with Timezones
- All datetime fields should be in UTC timezone format (ISO 8601 UTC format)
- Events are created and fetched in UTC timezone only
- Do not include timezone information - all times are treated as UTC
- Available slots calculation works in UTC but respects working hours in specified timezone for calculation

### Event Recurring Patterns
- Set `singleEvents=true` to expand recurring events into individual instances
- Use `singleEvents=false` to get recurring event patterns
- When `singleEvents=false`, `orderBy` parameter is ignored (Google Calendar limitation)

### Attendee Management
- Include attendee email addresses when creating events
- Use `sendUpdates` parameter to control notification behavior
- `guestsCanModify`, `guestsCanInviteOthers`, and `guestsCanSeeOtherGuests` control attendee permissions

## Example Integration Flow

### 1. Connect Calendar Account
```javascript
// Step 1: Obtain Google OAuth tokens (outside this API)
const googleTokens = await getGoogleOAuthTokens();

// Step 2: Add calendar account
const calendarAccount = await fetch('/api/calendar/accounts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@example.com',
    calendar_name: 'Work Calendar',
    provider: 'google',
    auth: {
      access_token: googleTokens.access_token,
      refresh_token: googleTokens.refresh_token
    }
  })
});
```

### 2. Find Available Slots and Book Meeting
```javascript
// Step 1: Get available slots for next week
const slotsResponse = await fetch(
  `/api/calendar/accounts/${accountId}/available-slots?` +
  `timeMin=2025-09-11T00:00:00Z&` +
  `timeMax=2025-09-18T23:59:59Z&` +
  `duration=60&` +
  `workingHoursStart=09:00&` +
  `workingHoursEnd=17:00`,
  {
    headers: { 'Authorization': `Bearer ${jwtToken}` }
  }
);

const slots = await slotsResponse.json();
const firstAvailableSlot = slots.data.availableSlots[0];

// Step 2: Book the first available slot
const eventResponse = await fetch(`/api/calendar/accounts/${accountId}/events`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    summary: 'Client Meeting',
    start: firstAvailableSlot.start, // UTC format string
    end: firstAvailableSlot.end,     // UTC format string
    attendees: [{ email: 'client@example.com' }]
  })
});
```

## Support and Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure Google Calendar scopes are included in OAuth setup
2. **Token Refresh**: The system automatically handles token refresh using refresh tokens
3. **Timezone Issues**: Always include timezone information in datetime fields
4. **Rate Limiting**: Implement proper retry logic with exponential backoff

### UTC Timezone Handling

**Important:** All datetime fields are handled in UTC timezone:

- **Input Format**: Send datetime as UTC strings: `"2025-09-12T18:00:00.000Z"`
- **Output Format**: Receive datetime as UTC strings: `"2025-09-12T18:00:00.000Z"`
- **No Timezone Info**: Do not include timezone information in requests
- **Conversion**: The API automatically converts UTC strings to Google Calendar's internal format

**Example UTC Datetime Usage:**
```json
{
  "summary": "UTC Meeting",
  "start": "2025-09-12T14:00:00.000Z",  // UTC datetime string
  "end": "2025-09-12T15:00:00.000Z"     // UTC datetime string
}
```

### Debug Information

Enable debug logging by setting appropriate log levels. The system logs:
- OAuth token refresh attempts
- Google Calendar API requests and responses
- Available slots calculation details
- UTC datetime conversion details
- Error conditions with full stack traces

This completes the comprehensive Google Calendar API documentation. The API provides full CRUD functionality for calendar events plus intelligent available slots detection, all while maintaining complete separation from the Gmail integration and consistent UTC timezone handling.
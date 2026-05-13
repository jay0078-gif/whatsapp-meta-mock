# WhatsApp Meta Mock API

A mocked Meta WhatsApp Embedded Signup and Template Message integration built with NestJS, TypeScript, PostgreSQL, and TypeORM.

## Overview

This project simulates the Meta WhatsApp Cloud API flow for appointment notifications. Since real Meta Business credentials are unavailable, everything is intentionally mocked. The architecture is designed so real Meta APIs can replace mocked logic with minimal changes.

## Tech Stack

- NestJS + TypeScript
- PostgreSQL + TypeORM
- Swagger (API Docs)
- Jest (Testing)

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run start:dev
```

## Environment Variables

```env
WHATSAPP_PROVIDER=META_WHATSAPP   # or MESSAGE_BIRD
WEBHOOK_VERIFY_TOKEN=mock_verify_token
META_APP_SECRET=mock_app_secret
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=whatsapp_mock
```

## Swagger Docs

http://localhost:3000/api-docs

## Architecture

Factory pattern with provider switching via single env variable:
POST /appointments
→ AppointmentService
→ WhatsAppProviderFactory (reads WHATSAPP_PROVIDER)
→ MetaProvider OR MessageBirdProvider
→ sendTemplateMessage() with appointment_confirmation template

## API Reference

### Appointments

#### POST /appointments
Create appointment and send WhatsApp template message.

**Request:**
```json
{
  "patientName": "Jay Patel",
  "phoneNumber": "919999999999",
  "appointmentDate": "2026-05-15"
}
```

**Response:**
```json
{
  "success": true,
  "appointment": {
    "patientName": "Jay Patel",
    "phoneNumber": "919999999999",
    "appointmentDate": "2026-05-15"
  },
  "whatsappResponse": {
    "success": true,
    "provider": "META_WHATSAPP",
    "messageId": "meta-tmpl-uuid-001",
    "templateName": "appointment_confirmation",
    "status": "SENT",
    "sentAt": "2026-05-15T10:00:00.000Z"
  }
}
```

---

### Templates

#### POST /templates/confirmation
Send appointment confirmation template.

**Request:**
```json
{
  "templateName": "appointment_confirmation",
  "patientName": "Jay Patel",
  "doctorName": "Dr. Sharma",
  "appointmentDate": "2026-05-15",
  "appointmentTime": "10:30 AM",
  "hospitalName": "City Hospital",
  "phoneNumber": "919999999999"
}
```

**Response:**
```json
{
  "success": true,
  "provider": "META_WHATSAPP",
  "messageId": "meta-tmpl-a1b2c3d4-...",
  "templateName": "appointment_confirmation",
  "status": "SENT",
  "sentAt": "2026-05-15T10:00:00.000Z",
  "metaPayload": {
    "messaging_product": "whatsapp",
    "to": "919999999999",
    "type": "template",
    "template": {
      "name": "appointment_confirmation",
      "language": { "code": "en_US" },
      "components": [{
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Jay Patel" },
          { "type": "text", "text": "Dr. Sharma" },
          { "type": "text", "text": "2026-05-15" },
          { "type": "text", "text": "10:30 AM" },
          { "type": "text", "text": "City Hospital" }
        ]
      }]
    }
  },
  "retryCount": 0
}
```

#### POST /templates/reminder
Same request shape as confirmation. Use `templateName: "appointment_reminder"`.

#### POST /templates/cancellation
Same request shape as confirmation. Use `templateName: "appointment_cancellation"`.

#### POST /templates/webhook/delivery
Simulate delivery status update from Meta.

**Request:**
```json
{
  "messageId": "meta-tmpl-a1b2c3d4-...",
  "status": "DELIVERED"
}
```

**Failure simulation:**
```json
{
  "messageId": "meta-tmpl-a1b2c3d4-...",
  "status": "FAILED",
  "failureReason": "Number not registered on WhatsApp"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "meta-tmpl-a1b2c3d4-...",
  "status": "DELIVERED",
  "updatedAt": "2026-05-15T10:05:00.000Z"
}
```

#### GET /templates/status/:messageId
Get current delivery status of a template message.

**Response:**
```json
{
  "messageId": "meta-tmpl-a1b2c3d4-...",
  "templateName": "appointment_confirmation",
  "provider": "META_WHATSAPP",
  "status": "DELIVERED",
  "retryCount": 0,
  "failureReason": null,
  "sentAt": "2026-05-15T10:00:00.000Z",
  "updatedAt": "2026-05-15T10:05:00.000Z"
}
```

---

### Meta Signup Flow

#### POST /meta/signup/start
**Request:**
```json
{
  "businessId": "mock-business-123",
  "businessName": "Test Clinic",
  "phoneNumber": "919999999999"
}
```

#### POST /meta/signup/callback
**Request:**
```json
{ "fail": false }
```

#### GET /meta/webhook
Webhook verification. Use `hub.verify_token=mock_verify_token`.

#### POST /meta/webhook
Simulate incoming WhatsApp message webhook.

---

## Retry and Fallback Logic

- Primary provider retried up to 3 times with exponential backoff
- On exhaustion, fallback provider is tried automatically
- If both fail, status is saved as FAILED with failure reason
- All attempts persisted to Postgres via TemplateMessage entity

## Template Status Lifecycle
SENT → DELIVERED
SENT → FAILED

## Tests

```bash
npm run test
npm run test -- --verbose
```

37 tests across 7 spec files covering all flows including retry, fallback, and status tracking.

## Provider Switching

```env
WHATSAPP_PROVIDER=META_WHATSAPP   # uses Meta Cloud API structure
WHATSAPP_PROVIDER=MESSAGE_BIRD    # uses MessageBird structure
```

Fallback is always the opposite provider automatically.
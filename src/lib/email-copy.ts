// Editable copy for the welcome email sent to interested leads.
// Change these freely — no logic lives here. Keep the documents list SHORT;
// every extra item lowers the reply rate. Confirm the exact list with the client.

// The signature / who the email is from, as the lead reads it.
export const COMPANY_NAME = "ARF Financial";

// Documents the lead is asked to reply with. Keep it minimal.
// TODO: confirm this list with the business owner before going live.
export const DOCUMENTS_REQUESTED = [
  "A photo of your driver's license or government ID",
  "Your 3 most recent business bank statements",
];

// Required on commercial email (CAN-SPAM): a real physical mailing address.
// Replace with the client's actual business address before sending to real leads.
export const MAILING_ADDRESS = "ARF Financial · [street, city, state ZIP]";

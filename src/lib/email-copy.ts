// Editable copy for the welcome email sent to interested leads.
// Change anything here freely — no logic lives in this file.

export const COMPANY_NAME = "Lending Success Pot";
export const SENDER_NAME = "Rosemarie Zuleta";
export const WEBSITE = "https://lendingsuccesspot.com/";

export const SUBJECT = "Welcome to Lending Success Pot — your financing next steps";

// First line after the greeting.
export const INTRO =
  "Thank you for your interest in business financing. We're here to help established businesses with physical locations explore funding solutions tailored to their growth goals.";

// The lead is asked to REPLY with these (info, not attachments — light ask).
export const REQUESTED_ITEMS = [
  "Business Name",
  "Business Type (Hotel, Medical Clinic, Real Estate, Restaurant, Retail, etc.)",
  "Business Address",
  "Funding Amount Requested",
  "Estimated Credit Score if known",
  "Valid Driver's License or Government-Issued Photo ID (Yes/No)",
  "Best Contact Phone Number",
];

// Paragraph after the list.
export const CLOSING =
  "Once we receive your information, our team will review your request and contact you to discuss the next steps and available financing options. We appreciate the opportunity to serve your business and look forward to assisting you.";

export const SIGN_OFF = "Kind regards,";

// CAN-SPAM requires a real physical mailing address on commercial email.
// TODO: replace with Lending Success Pot's actual business address before go-live.
export const MAILING_ADDRESS = "Lending Success Pot · [street, city, state ZIP]";

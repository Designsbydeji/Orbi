// Public settings for the browser. The anon key is meant to be public:
// what a visitor can do is limited by the row-level security rules in the database.
// Never put the secret / service_role key in this file.
window.ORBI_CONFIG = {
  url: "https://eimbebidayhrkwcecpcu.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWJlYmlkYXlocmt3Y2VjcGN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTQ2ODgsImV4cCI6MjEwNzc3MDY4OH0.zaLMrlQTS13x0OdW_5lRu15qRisNG9fCigQa_7C3QDg",
  // Reels are switched off. Change reels to true to bring them back.
  features: { reels: false },
  supportEmail: "support.orbiapp@gmail.com",
  // Switch each one to true only after it is set up in the Supabase dashboard.
  providers: { google: false, apple: false, phone: false }
};

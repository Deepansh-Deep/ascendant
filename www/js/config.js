/* Ascendant server configuration.
   Leave supabaseUrl/supabaseAnonKey empty to run fully offline (no accounts, guilds or purchases).
   To go live: follow "Going live" in the README, then paste your Supabase project URL and anon key here.
   The anon key is meant to be public. NEVER put the service_role key in this file. */
window.ASCENDANT_CONFIG = {
  supabaseUrl: "https://ohxwgnffhmpvixbgrceb.supabase.co",
  supabaseAnonKey: "sb_publishable_W8uFPXkiEbfh-ijvVFy3TQ_fzu4phqz",
  // the installed Android app checks this file and offers new versions from your website
  updateUrl: "https://deepansh-deep.github.io/ascendant/version.json"
};

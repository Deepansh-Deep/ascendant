/* Ascendant guild server configuration.
   Leave both empty to run fully offline (the Guild tab then says the server is not connected).
   To enable live gym leaderboards: create a Supabase project, run supabase/schema.sql,
   enable Anonymous sign-ins (Authentication > Providers), then paste the values below.
   The anon key is designed to be public; Row Level Security in schema.sql protects the data. */
window.ASCENDANT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};

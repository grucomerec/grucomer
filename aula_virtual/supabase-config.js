// Reemplaza estos datos con las credenciales reales de tu panel de Supabase
// Las encuentras en: Project Settings -> API
const SUPABASE_URL = "https://gfspoibkfuuwzahjswok.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdmc3BvaWJrZnV1d3phaGpzd29rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MTI1MzYsImV4cCI6MjA5NDk4ODUzNn0.1Ax6NmdOy0JMnGvDpH9zfu9VNsb0StssofggO9daT4k";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.supabase = supabaseClient;

console.log("✅ Cliente de Supabase duplicado globalmente con éxito para Admin y Docente.");
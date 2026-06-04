document.addEventListener("DOMContentLoaded", () => {
  const formLogin = document.getElementById("form-login");
  const btnIngresar = document.getElementById("btn-ingresar");

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Bloquear interfaz visual durante la espera
    btnIngresar.disabled = true;
    btnIngresar.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Validando acceso...';

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      // 1. Validar las credenciales en Supabase Auth
      const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (authError) {
        // Manejar errores típicos de autenticación de forma amigable
        if (authError.message.includes("Invalid login credentials")) {
          throw new Error("El correo o la contraseña son incorrectos.");
        }
        throw authError;
      }

      const userUid = authData.user.id;

      // 2. Buscar el rol y estado real en la tabla de perfiles usando el UUID obtenido
      const { data: perfil, error: perfilError } = await supabaseClient
        .from('perfiles')
        .select('rol, estado, nombre_apellido')
        .eq('id', userUid)
        .single();

      if (perfilError || !perfil) {
        // En caso extremo de que exista en Auth pero no tenga perfil creado
        await supabaseClient.auth.signOut();
        throw new Error("No se encontró un perfil de usuario asignado a esta cuenta.");
      }

      // 3. Enrutamiento inteligente basado en Roles y Condiciones de Negocio
      switch (perfil.rol) {
        case 'admin':
          // El Administrador entra directo a gestionar solicitudes de ingreso y matrículas
          window.location.href = "admin_dash.html";
          break;

        case 'docente':
          // El profesor entra directo a ver sus materias y listas asignadas
          window.location.href = "docente_dash.html";
          break;

        case 'estudiante':
          // REGLA DE NEGOCIO CRÍTICA: Controlar que el alumno esté aprobado por administración
          if (perfil.estado === 'pendiente') {
            await supabaseClient.auth.signOut(); // Deslogueamos para no dejar sesión abierta sin autorización
            alert(`🔒 Acceso Restringido:\n\nHola ${perfil.nombre_apellido}, tu postulación está registrada pero aún se encuentra en proceso de revisión por parte de la administración.\n\nPor favor, comunícate con administración para agilizar tu aprobación.`);
            window.location.reload();
          } else {
            // Si está aprobado, va directo a su Aula Virtual personal
            window.location.href = "estudiante_dash.html";
          }
          break;

        default:
          await supabaseClient.auth.signOut();
          throw new Error("Rol desconocido asignado al sistema.");
      }

    } catch (err) {
      console.error("Error en el login:", err.message);
      alert("⚠️ Error de Ingreso:\n" + err.message);
      btnIngresar.disabled = false;
      btnIngresar.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i> Iniciar Sesión';
    }
  });
});
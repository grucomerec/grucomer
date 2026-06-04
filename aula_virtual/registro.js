// js/registro.js

document.addEventListener("DOMContentLoaded", async () => {
  const selectCurso = document.getElementById("reg-curso");
  const formRegistro = document.getElementById("form-registro");
  const btnEnviar = document.getElementById("btn-enviar");

  // 1. CARGAR CURSOS DINÁMICAMENTE DESDE SUPABASE
  async function cargarCursos() {
    console.log("Intentando conectar a Supabase...");

    try {
      // ⚠️ Forzar que no se cachee la petición
      const { data: cursos, error } = await supabaseClient
        .from("cursos")
        .select("id, nombre_curso", { head: false })
        .abortSignal(new AbortController().signal);

      if (error) {
        console.error("Error detallado de Supabase:", error);
        selectCurso.innerHTML =
          '<option value="" disabled>Error al cargar los cursos</option>';
        return;
      }

      console.log("Datos recibidos de la tabla cursos:", cursos);

      // Limpieza previa para evitar duplicados por caché
      selectCurso.innerHTML = "";

      if (!cursos || cursos.length === 0) {
        selectCurso.innerHTML =
          '<option value="" disabled>No hay cursos disponibles este mes</option>';
        return;
      }

      selectCurso.innerHTML =
        '<option value="" selected disabled>Selecciona el curso...</option>';
      cursos.forEach((curso) => {
        const option = document.createElement("option");
        option.value = curso.id;
        option.textContent = curso.nombre_curso;
        selectCurso.appendChild(option);
      });
    } catch (err) {
      console.error("Error inesperado al cargar cursos:", err.message);
      selectCurso.innerHTML =
        '<option value="" disabled>Error al conectar con Supabase</option>';
    }
  }

  cargarCursos();

  // 2. PROCESAR EL REGISTRO AL ENVIAR EL FORMULARIO
  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();

    btnEnviar.disabled = true;
    btnEnviar.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...';

    const cedula = document.getElementById("reg-cedula").value.trim();
    const nombre = document.getElementById("reg-nombre").value.trim();
    const celular = document.getElementById("reg-celular").value.trim();
    const correoPersonal = document.getElementById("reg-correo").value.trim();
    const cursoId = selectCurso.value;

    // ✅ Validaciones básicas antes de enviar
    if (!cedula || !nombre || !celular || !correoPersonal || !cursoId) {
      alert("Por favor completa todos los campos antes de enviar.");
      btnEnviar.disabled = false;
      btnEnviar.innerHTML =
        '<i class="bi bi-person-plus-fill me-2"></i> Solicitar Acceso';
      return;
    }

    const correoInstitucional = `e${cedula}@grucomer.com`;
    const contraseniaTemporal = `e.${cedula}`;

    try {
      let usuarioUid = null;

      // Paso A: Intentar crear el usuario en Autenticación
      const { data: authData, error: authError } =
        await supabaseClient.auth.signUp({
          email: correoInstitucional,
          password: contraseniaTemporal,
        });

      if (authError) {
        // ⚠️ Manejo robusto de errores
        if (
          authError.status === 400 ||
          authError.message.toLowerCase().includes("already registered")
        ) {
          // Usuario ya existe → buscar perfil
          const { data: perfilExistente, error: errorBusqueda } =
            await supabaseClient
              .from("perfiles")
              .select("id")
              .eq("cedula", cedula)
              .maybeSingle();

          if (errorBusqueda || !perfilExistente) {
            throw new Error(
              "El usuario ya existe en autenticación pero no se encontró su perfil."
            );
          }
          usuarioUid = perfilExistente.id;
        } else {
          throw authError;
        }
      } else {
        usuarioUid = authData.user.id;
      }

      // Paso B: Insertar/Actualizar perfil
      const { error: perfilError } = await supabaseClient
        .from("perfiles")
        .upsert(
          [
            {
              id: usuarioUid,
              cedula: cedula,
              nombre_apellido: nombre,
              celular: celular,
              correo_personal: correoPersonal,
              correo_institucional: correoInstitucional,
              rol: "estudiante",
              estado: "pendiente",
            },
          ],
          { onConflict: "id" }
        );

      if (perfilError) throw perfilError;

      // Paso C: Insertar inscripción
      const { error: inscripcionError } = await supabaseClient
        .from("inscripciones")
        .insert([
          {
            perfil_id: usuarioUid,
            curso_id: cursoId,
          },
        ]);

      if (inscripcionError) {
        if (inscripcionError.code === "23505") {
          alert(
            `⚠️ Atención:\nYa has enviado una solicitud de inscripción para este curso.\nNo puedes registrarte dos veces en la misma materia.`
          );
          return;
        }
        throw inscripcionError;
      }

      // ✅ Registro Exitoso
      alert(
        `¡Solicitud enviada con éxito!\n\nTe has postulado al curso correctamente.\n📧 Correo Institucional: ${correoInstitucional}\n\nNota: Si eres un alumno nuevo, espera la aprobación de un administrador.`
      );
      formRegistro.reset();
    } catch (err) {
      console.error("Error en el proceso de registro:", err.message);
      alert("Hubo un error al procesar el registro: " + err.message);
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.innerHTML =
        '<i class="bi bi-person-plus-fill me-2"></i> Solicitar Acceso';
    }
  });
});

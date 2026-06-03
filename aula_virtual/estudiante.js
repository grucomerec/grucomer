// =========================================================================
// VARIABLES DE CONTROL GLOBAL DE ESTADO
// =========================================================================
let cursoActivoId = null;

// =========================================================================
// GESTOR DE EVENTOS INICIALES (DOM CONTENT LOADED)
// =========================================================================
document.addEventListener("DOMContentLoaded", async () => {
    await inicializarPanelEstudiante();

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", cerrarSesionEstudiante);
    }
});

// =========================================================================
// NÚCLEO LÓGICO DE INICIALIZACIÓN
// =========================================================================
async function inicializarPanelEstudiante() {
    try {
        if (typeof supabase === 'undefined' || !supabase) {
            console.error("❌ Error: El cliente de Supabase no se encuentra disponible.");
            return;
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            window.location.href = "index.html";
            return;
        }

        // 1. Recuperamos los datos del perfil del alumno
        const { data: perfil, error: perfilError } = await supabase
            .from('perfiles')
            .select('nombre_apellido, rol')
            .eq('id', user.id)
            .single();

        if (perfilError) throw perfilError;

        // Seguridad: Si no es estudiante, lo expulsamos
        if (perfil.rol !== 'estudiante') {
            await supabase.auth.signOut();
            window.location.href = "index.html";
            return;
        }
        
        const txtNombreEstudiante = document.getElementById("estudiante-name");
        if (txtNombreEstudiante) {
            txtNombreEstudiante.innerHTML = `<i class="bi bi-mortarboard-fill me-1"></i> Alumno: ${perfil.nombre_apellido}`;
        }

        // 2. INNER JOIN RELACIONAL: Buscamos las inscripciones aprobadas del alumno
        // Traemos el ID de la inscripción y los datos del curso asociado usando la FK curso_id
        const { data: inscripciones, error: inscripcionesError } = await supabase
            .from('inscripciones')
            .select(`
                curso_id,
                cursos (
                    id,
                    nombre_curso
                )
            `)
            .eq('perfil_id', user.id)
            .eq('estado', 'aprobado');

        if (inscripcionesError) throw inscripcionesError;

        const selectCurso = document.getElementById("select-curso-estudiante");
        if (selectCurso) {
            selectCurso.innerHTML = '<option value="">-- Selecciona una asignatura --</option>';
            
            if (inscripciones && inscripciones.length > 0) {
                inscripciones.forEach(ins => {
                    const cursoData = ins.cursos;
                    if (cursoData) {
                        const option = document.createElement("option");
                        option.value = cursoData.id;
                        option.textContent = cursoData.nombre_curso;
                        selectCurso.appendChild(option);
                    }
                });
            } else {
                selectCurso.innerHTML = '<option value="">No registras cursos aprobados</option>';
            }
        }

    } catch (error) {
        console.error("Error crítico durante el arranque del entorno:", error.message);
    }
}

// =========================================================================
// CONTROLADORES DE INTERFAZ ACTIVA (UI)
// =========================================================================
window.cambiarCursoActivo = function(idCurso) {
    const zonaTrabajo = document.getElementById("zona-trabajo-estudiante");
    const mensajeEspera = document.getElementById("mensaje-espera-curso");

    if (!idCurso) {
        cursoActivoId = null;
        if (zonaTrabajo) zonaTrabajo.classList.add("d-none");
        if (mensajeEspera) mensajeEspera.classList.remove("d-none");
        return;
    }

    cursoActivoId = idCurso;
    if (zonaTrabajo) zonaTrabajo.classList.remove("d-none");
    if (mensajeEspera) mensajeEspera.classList.add("d-none");

    cargarRecursosEstudiante();
}

// =========================================================================
// MÓDULO VISUALIZACIÓN DE RECURSOS (FILTRADO POR VISIBILIDAD)
// =========================================================================
async function cargarRecursosEstudiante() {
    try {
        // Consultamos la tabla recursos filtrando por el curso activo
        // EXCLUSIVO ESTUDIANTES: Solo descargamos los recursos que tengan visible = true
        const { data: recursos, error } = await supabase
            .from('recursos')
            .select('*')
            .eq('curso_id', cursoActivoId)
            .eq('visible', true)
            .order('semana', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById("tabla-recursos-estudiante-body");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!recursos || recursos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">El docente aún no ha publicado material didáctico para este curso.</td></tr>`;
            return;
        }

        recursos.forEach(rec => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><span class="badge bg-primary bg-opacity-10 text-primary px-3 py-2 fw-bold">Semana ${rec.semana}</span></td>
                <td class="fw-semibold text-secondary">${rec.titulo}</td>
                <td class="text-end">
                    <a href="${rec.url}" target="_blank" class="btn btn-sm btn-primary rounded-pill px-3">
                        <i class="bi bi-cloud-arrow-down-fill me-1"></i> Abrir Enlace
                    </a>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al renderizar la cuadrícula de recursos:", error.message);
    }
}

// =========================================================================
// DESTRUCCIÓN SEGURA DE SESIÓN
// =========================================================================
async function cerrarSesionEstudiante() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        window.location.href = "index.html"; 
    } catch (error) {
        alert("Error al salir del sistema: " + error.message);
    }
}
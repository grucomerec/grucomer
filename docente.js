// =========================================================================
// VARIABLES DE CONTROL GLOBAL DE ESTADO
// =========================================================================
let cursoActivoId = null;
let vistaActual = 'recursos';
let alumnosCursoOriginal = [];

// =========================================================================
// GESTOR DE EVENTOS INICIALES (DOM CONTENT LOADED)
// =========================================================================
document.addEventListener("DOMContentLoaded", async () => {
    await inicializarPanelDocente();

    const formRecurso = document.getElementById("form-recurso");
    if (formRecurso) {
        formRecurso.addEventListener("submit", guardarRecurso);
    }

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", cerrarSesionDocente);
    }
});

// =========================================================================
// NÚCLEO LÓGICO DE INICIALIZACIÓN
// =========================================================================
async function inicializarPanelDocente() {
    try {
        if (typeof supabase === 'undefined' || !supabase) {
            console.error("❌ Error estructural: El objeto 'supabase' no ha sido instanciado.");
            return;
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            window.location.href = "index.html";
            return;
        }

        const { data: perfil, error: perfilError } = await supabase
            .from('perfiles')
            .select('nombre_apellido')
            .eq('id', user.id)
            .single();

        if (perfilError) throw perfilError;
        
        const txtNombreDocente = document.getElementById("docente-name");
        if (txtNombreDocente) {
            txtNombreDocente.innerHTML = `<i class="bi bi-person-circle me-1"></i> Prof: ${perfil.nombre_apellido}`;
        }

        const { data: cursos, error: cursosError } = await supabase
            .from('cursos')
            .select('id, nombre_curso') 
            .eq('docente_id', user.id); 

        if (cursosError) throw cursosError;

        const selectCurso = document.getElementById("select-curso-docente");
        if (selectCurso) {
            selectCurso.innerHTML = '<option value="">-- Selecciona un curso --</option>';
            
            cursos.forEach(curso => {
                const option = document.createElement("option");
                option.value = curso.id;
                option.textContent = `${curso.nombre_curso}`; 
                selectCurso.appendChild(option);
            });
        }

    } catch (error) {
        console.error("Error crítico durante la inicialización del panel:", error.message);
    }
}

// =========================================================================
// CONTROLADORES DE RENDERIZADO Y FLUJO DE PESTAÑAS (UI)
// =========================================================================

window.cambiarCursoActivo = function(idCurso) {
    const zonaTrabajo = document.getElementById("zona-trabajo-docente");
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

    cargarDatosSubVista();
}

window.cambiarSubVista = function(vista) {
    vistaActual = vista;
    
    const tabRecursos = document.getElementById("tab-recursos");
    const tabAlumnos = document.getElementById("tab-alumnos");
    
    if (tabRecursos) tabRecursos.classList.toggle("active", vista === 'recursos');
    if (tabAlumnos) tabAlumnos.classList.toggle("active", vista === 'alumnos');

    const divRecursos = document.getElementById("vista-recursos");
    const divAlumnos = document.getElementById("vista-alumnos");

    if (divRecursos) divRecursos.classList.toggle("d-none", vista !== 'recursos');
    if (divAlumnos) divAlumnos.classList.toggle("d-none", vista !== 'alumnos');

    cargarDatosSubVista();
}

function cargarDatosSubVista() {
    if (!cursoActivoId) return;
    
    if (vistaActual === 'recursos') {
        cargarRecursosCurso();
    } else if (vistaActual === 'alumnos') {
        cargarAlumnosCurso();
    }
}

// =========================================================================
// MÓDULO A: CONTROL PEDAGÓGICO DE MATERIALES
// =========================================================================

async function cargarRecursosCurso() {
    try {
        const { data: recursos, error } = await supabase
            .from('recursos')
            .select('*')
            .eq('curso_id', cursoActivoId)
            .order('semana', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById("tabla-recursos-body");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!recursos || recursos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No hay materiales publicados en este curso.</td></tr>`;
            return;
        }

        recursos.forEach(rec => {
            const tr = document.createElement("tr");
            
            const badgeVisibilidad = rec.visible 
                ? `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-eye-fill"></i> Visible</span>`
                : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-eye-slash-fill"></i> Oculto</span>`;

            const botonVisibilidad = rec.visible
                ? `<button class="btn btn-sm btn-outline-secondary me-1" onclick="alternarVisibilidad(${rec.id}, false)"><i class="bi bi-eye-slash"></i> Ocultar</button>`
                : `<button class="btn btn-sm btn-outline-success me-1" onclick="alternarVisibilidad(${rec.id}, true)"><i class="bi bi-eye"></i> Mostrar</button>`;

            tr.innerHTML = `
                <td><span class="badge bg-secondary px-2">Sem. ${rec.semana}</span></td>
                <td class="fw-semibold text-dark">${rec.titulo}</td>
                <td>
                    <a href="${rec.url}" target="_blank" class="btn btn-sm btn-link text-decoration-none text-truncate d-inline-block" style="max-width: 150px;">
                        <i class="bi bi-box-arrow-up-right me-1"></i> Enlace
                    </a>
                </td>
                <td>${badgeVisibilidad}</td>
                <td class="text-end">
                    ${botonVisibilidad}
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarRecurso(${rec.id})"><i class="bi bi-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al renderizar los recursos:", error.message);
    }
}

async function guardarRecurso(e) {
    e.preventDefault();
    if (!cursoActivoId) return;

    const titulo = document.getElementById("rec-titulo").value.trim();
    const url = document.getElementById("rec-url").value.trim();
    const semana = parseInt(document.getElementById("rec-semana").value, 10);
    const visible = document.getElementById("rec-visible").checked;

    try {
        const { error } = await supabase
            .from('recursos')
            .insert([{ curso_id: cursoActivoId, titulo, url, semana, visible }]);

        if (error) throw error;

        document.getElementById("form-recurso").reset();
        await cargarRecursosCurso();

    } catch (error) {
        alert("Error al intentar registrar el material: " + error.message);
    }
}

window.alternarVisibilidad = async function(idRecurso, nuevoEstado) {
    try {
        const { error } = await supabase
            .from('recursos')
            .update({ visible: nuevoEstado })
            .eq('id', idRecurso);

        if (error) throw error;
        await cargarRecursosCurso();
    } catch (error) {
        console.error("Error al actualizar visibilidad:", error.message);
    }
}

window.eliminarRecurso = async function(idRecurso) {
    if (!confirm("¿Está seguro de que desea eliminar permanentemente este recurso didáctico?")) return;

    try {
        const { error } = await supabase
            .from('recursos')
            .delete()
            .eq('id', idRecurso);

        if (error) throw error;
        await cargarRecursosCurso();
    } catch (error) {
        console.error("Error al remover el recurso:", error.message);
    }
}

// =========================================================================
// MÓDULO B: CONTROL Y FILTRADO DE ALUMNOS (CORREGIDO RELACIONAL)
// =========================================================================
async function cargarAlumnosCurso() {
    try {
        // Al cambiar de curso o recargar, limpiamos el input de búsqueda visualmente
        const inputBusqueda = document.getElementById("input-busqueda-alumno");
        if (inputBusqueda) inputBusqueda.value = "";

        const { data: inscripciones, error } = await supabase
            .from('inscripciones')
            .select(`
                id, 
                estado, 
                perfil_id (
                    nombre_apellido, 
                    cedula, 
                    celular, 
                    correo_personal
                )
            `)
            .eq('curso_id', cursoActivoId)
            .eq('estado', 'aprobado'); 

        if (error) throw error;

        // Guardamos el resultado limpio en nuestra variable global
        alumnosCursoOriginal = inscripciones ? inscripciones.map(ins => ins.perfil_id).filter(Boolean) : [];

        // Renderizamos la lista completa inicialmente
        renderizarTablaAlumnos(alumnosCursoOriginal);

    } catch (error) {
        console.error("Error al recuperar los alumnos:", error.message);
    }
}
function renderizarTablaAlumnos(listaAlumnos) {
    const tbody = document.getElementById("tabla-alumnos-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!listaAlumnos || listaAlumnos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No se encontraron estudiantes que coincidan con la búsqueda.</td></tr>`;
        return;
    }

    listaAlumnos.forEach(alumno => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="fw-semibold text-dark">${alumno.nombre_apellido}</td>
            <td class="text-secondary">${alumno.cedula || 'N/A'}</td>
            <td>${alumno.celular || 'N/A'}</td>
            <td><span class="text-muted small">${alumno.correo_personal || 'N/A'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// NUEVA: Filtra en tiempo real según lo que el usuario escribe
window.filtrarAlumnosEnPantalla = function() {
    const inputBusqueda = document.getElementById("input-busqueda-alumno");
    if (!inputBusqueda) return;

    // Convertimos a minúsculas y quitamos espacios extras para evitar fallos de tipeo
    const terminoBusqueda = inputBusqueda.value.toLowerCase().trim();

    // Si el buscador está vacío, volvemos a pintar todos los alumnos guardados
    if (terminoBusqueda === "") {
        renderizarTablaAlumnos(alumnosCursoOriginal);
        return;
    }

    // Filtramos el array en memoria buscando coincidencias en nombre o cédula
    const alumnosFiltrados = alumnosCursoOriginal.filter(alumno => {
        const nombre = alumno.nombre_apellido ? alumno.nombre_apellido.toLowerCase() : "";
        const cedula = alumno.cedula ? alumno.cedula.toLowerCase() : "";
        
        return nombre.includes(terminoBusqueda) || cedula.includes(terminoBusqueda);
    });

    // Pintamos únicamente los que pasaron el filtro
    renderizarTablaAlumnos(alumnosFiltrados);
}

// =========================================================================
// DESTRUCCIÓN SEGURA DE SESIÓN
// =========================================================================
async function cerrarSesionDocente() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        window.location.href = "index.html"; 
    } catch (error) {
        alert("Error al cerrar la sesión: " + error.message);
    }
}
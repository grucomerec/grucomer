// =========================================================================
// VARIABLES DE CONTROL GLOBAL DE ESTADO
// =========================================================================
let cursoActivoId = null;
let vistaActual = 'recursos';
let alumnosCursoOriginal = [];
let nominaAlumnosAsistencia = []; // Almacena los alumnos activos de asistencia
let modalForoInstance = null;     // Instancia del modal de Bootstrap para respuestas
let modalRevisionInstance = null; // Instancia del modal de Bootstrap para tareas
let tareaActivaSeleccionadaId = null; // ID de la tarea bajo revisión actual

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

    // Inicialización de componentes del módulo de asistencias
    const inputFecha = document.getElementById("asistencia-fecha-filtro");
    if (inputFecha) {
        const hoy = new Date().toISOString().split('T')[0];
        inputFecha.value = hoy;
        inputFecha.addEventListener("change", () => cargarPlanillaAsistencia());
    }

    const btnGuardarAsis = document.getElementById("btn-guardar-asistencia");
    if (btnGuardarAsis) {
        btnGuardarAsis.addEventListener("click", guardarAsistenciaDia);
    }

    const btnExportarAsis = document.getElementById("btn-exportar-asistencias");
    if (btnExportarAsis) {
        btnExportarAsis.addEventListener("click", exportarAsistenciasCurso);
    }

    // Inicialización del formulario de Foros
    const formForo = document.getElementById("form-foro");
    if (formForo) {
        formForo.addEventListener("submit", guardarForo);
    }

    // Inicialización del formulario de Tareas (Nuevo Módulo)
    const formTarea = document.getElementById("form-tarea");
    if (formTarea) {
        formTarea.addEventListener("submit", guardarTarea);
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
    
    const tabs = ['recursos', 'alumnos', 'asistencias', 'foros', 'tareas'];
    tabs.forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        if (tabEl) tabEl.classList.toggle("active", vista === t);
    });

    const views = ['recursos', 'alumnos', 'asistencias', 'foros', 'tareas'];
    views.forEach(v => {
        const viewEl = document.getElementById(`vista-${v}`);
        if (viewEl) viewEl.classList.toggle("d-none", vista !== v);
    });

    cargarDatosSubVista();
}

function cargarDatosSubVista() {
    if (!cursoActivoId) return;
    
    if (vistaActual === 'recursos') {
        cargarRecursosCurso();
    } else if (vistaActual === 'alumnos') {
        cargarAlumnosCurso();
    } else if (vistaActual === 'asistencias') {
        cargarPlanillaAsistencia();
    } else if (vistaActual === 'foros') {
        cargarForosCurso();
    } else if (vistaActual === 'tareas') {
        cargarTareasCurso();
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

        alumnosCursoOriginal = inscripciones ? inscripciones.map(ins => ins.perfil_id).filter(Boolean) : [];
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

window.filtrarAlumnosEnPantalla = function() {
    const inputBusqueda = document.getElementById("input-busqueda-alumno");
    if (!inputBusqueda) return;

    const terminoBusqueda = inputBusqueda.value.toLowerCase().trim();

    if (terminoBusqueda === "") {
        renderizarTablaAlumnos(alumnosCursoOriginal);
        return;
    }

    const alumnosFiltrados = alumnosCursoOriginal.filter(alumno => {
        const nombre = alumno.nombre_apellido ? alumno.nombre_apellido.toLowerCase() : "";
        const cedula = alumno.cedula ? alumno.cedula.toLowerCase() : "";
        return nombre.includes(terminoBusqueda) || cedula.includes(terminoBusqueda);
    });

    renderizarTablaAlumnos(alumnosFiltrados);
}

// =========================================================================
// MÓDULO C: SISTEMA DE CONTROL DE ASISTENCIA DIARIO
// =========================================================================
async function cargarPlanillaAsistencia() {
    if (!cursoActivoId) return;
    const fechaSeleccionada = document.getElementById("asistencia-fecha-filtro").value;
    
    const tbody = document.getElementById("tabla-asistencias-body");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Cargando nómina...</td></tr>`;

    try {
        const { data: inscritos, error: errInsc } = await supabase
            .from('inscripciones')
            .select(`
                perfil_id,
                perfiles!perfil_id (
                    cedula,
                    nombre_apellido
                )
            `)
            .eq('curso_id', cursoActivoId)
            .eq('estado', 'aprobado');

        if (errInsc) throw errInsc;

        if (!inscritos || inscritos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No hay alumnos activos matriculados en este curso.</td></tr>`;
            return;
        }

        nominaAlumnosAsistencia = inscritos;

        const { data: asistenciasGuardadas, error: errAsis } = await supabase
            .from('asistencias')
            .select('perfil_id, estado')
            .eq('curso_id', cursoActivoId)
            .eq('fecha', fechaSeleccionada);

        if (errAsis) throw errAsis;

        const mapaAsistencias = {};
        if (asistenciasGuardadas) {
            asistenciasGuardadas.forEach(a => mapaAsistencias[a.perfil_id] = a.estado);
        }

        tbody.innerHTML = "";
        
        inscritos.forEach(item => {
            const alumno = item.perfiles; 
            if (!alumno) return;

            const estadoReal = mapaAsistencias[item.perfil_id];
            const estaAsistiendo = estadoReal ? (estadoReal === 'presente' || estadoReal === 'atraso') : true;
            const novelty = estadoReal ? estadoReal : 'presente';

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="ps-4 fw-semibold text-dark">${alumno.nombre_apellido}</td>
                <td><code>${alumno.cedula || 'N/A'}</code></td>
                <td class="text-center">
                    <div class="form-check form-switch d-inline-block">
                        <input class="form-check-input check-asistencia" type="checkbox" data-perfil="${item.perfil_id}" ${estaAsistiendo ? 'checked' : ''}>
                    </div>
                </td>
                <td class="text-center">
                    <select class="form-select form-select-sm select-novedad" style="width: 140px; margin: 0 auto;" data-perfil="${item.perfil_id}">
                        <option value="presente" ${novelty === 'presente' ? 'selected' : ''}>Presente</option>
                        <option value="ausente" ${novelty === 'ausente' ? 'selected' : ''}>Ausente</option>
                        <option value="atraso" ${novelty === 'atraso' ? 'selected' : ''}>Atraso</option>
                        <option value="justificado" ${novelty === 'justificado' ? 'selected' : ''}>Justificado</option>
                    </select>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".check-asistencia").forEach(sw => {
            sw.addEventListener("change", (e) => {
                const select = tbody.querySelector(`select[data-perfil="${sw.dataset.perfil}"]`);
                if (select) select.value = e.target.checked ? "presente" : "ausente";
            });
        });

    } catch (error) {
        console.error("Error al estructurar planilla de asistencia:", error.message);
    }
}

async function guardarAsistenciaDia() {
    if (!cursoActivoId) return;
    const fechaSeleccionada = document.getElementById("asistencia-fecha-filtro").value;
    const filas = document.querySelectorAll("#tabla-asistencias-body tr");
    const registrosUpsert = [];

    filas.forEach(fila => {
        const select = fila.querySelector(".select-novedad");
        if (!select) return;

        const perfilId = select.dataset.perfil;
        const estadoAsistencia = select.value;

        registrosUpsert.push({
            curso_id: Number(cursoActivoId),
            perfil_id: perfilId,
            fecha: fechaSeleccionada,
            estado: estadoAsistencia
        });
    });

    if (registrosUpsert.length === 0) return;

    try {
        const { error } = await supabase
            .from('asistencias')
            .upsert(registrosUpsert, { onConflict: 'curso_id, perfil_id, fecha' });

        if (error) throw error;
        alert("¡Asistencia del día guardada y synchronized con éxito!");
        await cargarPlanillaAsistencia();

    } catch (error) {
        alert("Error al procesar el guardado de asistencias: " + error.message);
    }
}

async function exportarAsistenciasCurso() {
    if (!cursoActivoId) return;

    try {
        const { data: reportes, error } = await supabase
            .from('asistencias')
            .select('fecha, estado, perfiles(cedula, nombre_apellido)')
            .eq('curso_id', cursoActivoId)
            .order('fecha', { ascending: true });

        if (error) throw error;

        if (!reportes || reportes.length === 0) {
            alert("No hay registros históricos de asistencias guardados en este curso para exportar.");
            return;
        }

        let csvContent = "\uFEFF"; 
        csvContent += "Fecha,Cedula,Estudiante,Estado de Asistencia\n";

        reportes.forEach(r => {
            const alumno = r.perfiles;
            const cedula = alumno ? alumno.cedula : "N/A";
            const nombre = alumno ? alumno.nombre_apellido : "N/A";
            csvContent += `"${r.fecha}","${cedula}","${nombre}","${r.estado.toUpperCase()}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Reporte_Asistencias_Curso_${cursoActivoId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (error) {
        alert("Error al compilar el archivo de reporte: " + error.message);
    }
}

// =========================================================================
// MÓDULO D: NUEVA LOGICA OPERATIVA PARA EL CONTROL DE FOROS
// =========================================================================
async function cargarForosCurso() {
    try {
        const { data: foros, error } = await supabase
            .from('foros')
            .select('*')
            .eq('curso_id', cursoActivoId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById("tabla-foros-body");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!foros || foros.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">No se han aperturado foros en este curso académico.</td></tr>`;
            return;
        }

        foros.forEach(foro => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <span class="fw-semibold text-dark d-block">${foro.titulo}</span>
                    <small class="text-muted text-truncate d-inline-block" style="max-width: 320px;">${foro.descripcion}</small>
                </td>
                <td><span class="badge bg-light text-dark border"><i class="bi bi-calendar-event me-1"></i>${foro.fecha_limite}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="window.verRespuestasForo(${foro.id}, '${foro.titulo.replace(/'/g, "\\'")}', '${foro.descripcion.replace(/'/g, "\\'")}', '${foro.fecha_limite}')">
                        <i class="bi bi-chat-dots-fill"></i> Respuestas
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.eliminarForoDefinitivo(${foro.id})">
                        <i class="bi bi-trash"></i> Borrar
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al renderizar los foros:", error.message);
    }
}

async function guardarForo(e) {
    e.preventDefault();
    if (!cursoActivoId) return;

    const titulo = document.getElementById("foro-titulo").value.trim();
    const descripcion = document.getElementById("foro-descripcion").value.trim();
    const fecha_limite = document.getElementById("foro-fecha-limite").value;

    try {
        const { error } = await supabase
            .from('foros')
            .insert([{ curso_id: cursoActivoId, titulo, descripcion, fecha_limite }]);

        if (error) throw error;

        document.getElementById("form-foro").reset();
        await cargarForosCurso();
        alert("¡Tema de discusión publicado con éxito!");

    } catch (error) {
        alert("Error al intentar registrar el foro debate: " + error.message);
    }
}

window.eliminarForoDefinitivo = async function(idForo) {
    if (!confirm("🚨 ADVERTENCIA: ¿Está seguro de que desea eliminar este foro? Al hacerlo se borrarán permanentemente las participaciones y respuestas de todos los estudiantes.")) return;

    try {
        const { error } = await supabase
            .from('foros')
            .delete()
            .eq('id', idForo);

        if (error) throw error;
        await cargarForosCurso();
        alert("El foro y sus respuestas asociadas han sido removidos con éxito.");
    } catch (error) {
        alert("Error al intentar remover el foro: " + error.message);
    }
}

window.verRespuestasForo = async function(idForo, titulo, descripcion, fechaLimite) {
    document.getElementById("modalRespuestasLabel").innerText = titulo;
    
    // Verificación de seguridad si el elemento modal-foro-fecha no existe en el HTML adjunto
    const lblFecha = document.getElementById("modal-foro-fecha");
    if (lblFecha) {
        lblFecha.innerHTML = `<i class="bi bi-clock-history me-1"></i> Disponible hasta: <b>${fechaLimite}</b>`;
    }
    
    document.getElementById("modal-foro-descripcion").innerText = descripcion;

    const contenedor = document.getElementById("contenedor-comentarios-foro");
    contenedor.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div> Recuperando participaciones de alumnos...</div>`;

    if (!modalForoInstance) {
        modalForoInstance = new bootstrap.Modal(document.getElementById('modalRespuestasForo'));
    }
    modalForoInstance.show();

    try {
        const { data: comentarios, error } = await supabase
            .from('foro_respuestas')
            .select(`
                id,
                mensaje,
                created_at,
                perfiles!perfil_id (
                    nombre_apellido,
                    rol
                )
            `)
            .eq('foro_id', idForo)
            .order('created_at', { ascending: true });

        if (error) throw error;

        contenedor.innerHTML = "";

        if (!comentarios || comentarios.length === 0) {
            contenedor.innerHTML = `<div class="alert alert-light text-center border-dashed py-3 text-muted small"><i class="bi bi-chat-left-dots me-1"></i> Aún no se registran comentarios en este foro.</div>`;
            return;
        }

        comentarios.forEach(com => {
            const autor = com.perfiles;
            const esDocenteOAdmin = autor && (autor.rol === 'docente' || autor.rol === 'admin');
            
            const fondoCaja = esDocenteOAdmin ? 'bg-primary-subtle border-primary-subtle text-dark' : 'bg-white border-light-subtle';
            const badgeAutor = esDocenteOAdmin ? `<span class="badge bg-primary ms-1">Docente</span>` : '';
            const fechaFormateada = new Date(com.created_at).toLocaleString();

            const divMsg = document.createElement("div");
            divMsg.className = `p-3 rounded border shadow-sm ${fondoCaja}`;
            divMsg.innerHTML = `
                <div class="d-flex align-items-center justify-content-between mb-1 border-bottom pb-1">
                    <span class="fw-bold small text-dark"><i class="bi bi-person-fill text-secondary me-1"></i>${autor ? autor.nombre_apellido : 'Usuario Externo'}${badgeAutor}</span>
                    <span class="text-muted" style="font-size: 0.75rem;"><i class="bi bi-clock me-1"></i>${fechaFormateada}</span>
                </div>
                <p class="mb-0 small text-secondary style-justify" style="white-space: pre-line;">${com.mensaje}</p>
            `;
            contenedor.appendChild(divMsg);
        });

    } catch (error) {
        contenedor.innerHTML = `<div class="alert alert-danger small">Error al recuperar datos: ${error.message}</div>`;
    }
}

window.cerrarModalForo = function() {
    if (modalForoInstance) {
        modalForoInstance.hide();
    }
}

// =========================================================================
// MÓDULO E: GESTIÓN DE TAREAS Y CALIFICACIONES (GOOGLE FORMS DINÁMICO)
// =========================================================================
async function cargarTareasCurso() {
    try {
        const { data: tareas, error } = await supabase
            .from('tareas')
            .select('*')
            .eq('curso_id', cursoActivoId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        const tbody = document.getElementById("tabla-tareas-body");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!tareas || tareas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">No hay tareas publicadas en este curso académico.</td></tr>`;
            return;
        }

        tareas.forEach(t => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <span class="fw-bold text-dark d-block">${t.titulo}</span>
                    <small class="text-muted d-block text-truncate" style="max-width:400px;">${t.descripcion}</small>
                </td>
                <td><span class="badge bg-light text-dark border">${t.fecha_entrega.split('T')[0]}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-success me-1 fw-semibold" onclick="window.abrirModalRevision(${t.id})">
                        <i class="bi bi-bookmark-star-fill"></i> Calificar
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.eliminarTareaDefinitiva(${t.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { 
        console.error("Error en cargarTareasCurso: ", e.message); 
    }
}

async function guardarTarea(e) {
    e.preventDefault();
    if (!cursoActivoId) return;

    const titulo = document.getElementById("tarea-titulo").value.trim();
    const descripcion = document.getElementById("tarea-descripcion").value.trim();
    const url_formulario_google = document.getElementById("tarea-google-url").value.trim();
    const nota_maxima = parseInt(document.getElementById("tarea-nota-max").value, 10);
    const fecha_entrega = document.getElementById("tarea-fecha-limite").value + "T23:59:59Z";

    try {
        const { error } = await supabase
            .from('tareas')
            .insert([{ curso_id: cursoActivoId, titulo, descripcion, url_formulario_google, nota_maxima, fecha_entrega }]);

        if (error) throw error;
        document.getElementById("form-tarea").reset();
        await cargarTareasCurso();
        alert("¡Actividad asignada con éxito! El formulario de Google Forms ha sido enlazado.");
    } catch (e) { 
        alert("Error al guardar la tarea: " + e.message); 
    }
}

window.eliminarTareaDefinitiva = async function(idTarea) {
    if (!confirm("¿Seguro que deseas eliminar esta tarea? Se borrarán también las notas asociadas de los estudiantes.")) return;
    try {
        const { error } = await supabase.from('tareas').delete().eq('id', idTarea);
        if (error) throw error;
        await cargarTareasCurso();
    } catch(e) { 
        console.error(e.message); 
    }
}

window.abrirModalRevision = async function(idTarea) {
    tareaActivaSeleccionadaId = idTarea;
    const tbody = document.getElementById("tabla-revision-entregas-body");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5' class='text-center py-3'>Cruzando datos de matriculados y confirmaciones...</td></tr>";

    if (!modalRevisionInstance) {
        modalRevisionInstance = new bootstrap.Modal(document.getElementById('modalRevisionTareas'));
    }
    modalRevisionInstance.show();

    try {
        // 1. Obtener los alumnos aprobados reales del curso
        const { data: estudiantes, error: errEst } = await supabase
            .from('inscripciones')
            .select('perfil_id, perfiles!perfil_id(nombre_apellido)')
            .eq('curso_id', cursoActivoId)
            .eq('estado', 'aprobado');

        if (errEst) throw errEst;

        // 2. Obtener las confirmaciones de entrega existentes
        const { data: entregas, error: errEnt } = await supabase
            .from('tarea_entregas')
            .select('*')
            .eq('tarea_id', idTarea);

        if (errEnt) throw errEnt;

        const mapaEntregas = {};
        if (entregas) entregas.forEach(e => mapaEntregas[e.perfil_id] = e);

        tbody.innerHTML = "";
        if (!estudiantes || estudiantes.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' class='text-center text-muted py-3'>No hay alumnos registrados en este curso.</td></tr>";
            return;
        }

        estudiantes.forEach(item => {
            const al = item.perfiles; 
            if (!al) return;
            
            const registroEntrega = mapaEntregas[item.perfil_id];
            const confirmoEnvio = !!registroEntrega;
            
            const badgeEstado = confirmoEnvio 
                ? `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle-fill"></i> Entregado</span>`
                : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-exclamation-circle-fill"></i> Pendiente</span>`;

            const comentario = (confirmoEnvio && registroEntrega.comentario_estudiante) ? registroEntrega.comentario_estudiante : '<span class="text-muted small">Sin comentarios</span>';
            const notaActual = (confirmoEnvio && registroEntrega.nota_asignada !== null) ? registroEntrega.nota_asignada : "";
            const feedbackActual = (confirmoEnvio && registroEntrega.retroalimentacion) ? registroEntrega.retroalimentacion : "";

            const tr = document.createElement("tr");
            tr.setAttribute("data-perfil", item.perfil_id);
            tr.innerHTML = `
                <td class="fw-bold text-dark">${al.nombre_apellido}</td>
                <td>${badgeEstado}</td>
                <td><small class="text-secondary">${comentario}</small></td>
                <td>
                    <input type="number" step="0.01" class="form-control form-control-sm input-nota" value="${notaActual}" placeholder="0.00" style="width:95px;">
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm input-feedback" value="${feedbackActual}" placeholder="Ej: Buen análisis...">
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) { 
        console.error("Error al cargar la revisión de tareas: ", e.message); 
    }
}

window.guardarNotasTareas = async function() {
    if (!tareaActivaSeleccionadaId) return;

    const filas = document.querySelectorAll("#tabla-revision-entregas-body tr");
    const registrosUpsert = [];

    filas.forEach(f => {
        const perfilId = f.getAttribute("data-perfil");
        const inputNota = f.querySelector(".input-nota");
        const inputFeedback = f.querySelector(".input-feedback");

        if (perfilId && inputNota && inputFeedback) {
            const notaVal = inputNota.value;
            const feedbackVal = inputFeedback.value.trim();

            if (notaVal !== "" || feedbackVal !== "") {
                registrosUpsert.push({
                    tarea_id: Number(tareaActivaSeleccionadaId),
                    perfil_id: perfilId,
                    nota_asignada: notaVal !== "" ? parseFloat(notaVal) : null,
                    retroalimentacion: feedbackVal !== "" ? feedbackVal : null
                });
            }
        }
    });

    if (registrosUpsert.length === 0) { 
        window.cerrarModalRevision(); 
        return; 
    }

    try {
        const { error } = await supabase
            .from('tarea_entregas')
            .upsert(registrosUpsert, { onConflict: 'tarea_id, perfil_id' });

        if (error) throw error;
        alert("¡Calificaciones y retroalimentaciones sincronizadas con éxito!");
        window.cerrarModalRevision();
        await cargarTareasCurso();
    } catch (e) { 
        alert("Error al registrar notas: " + e.message); 
    }
}

window.cerrarModalRevision = function() { 
    if (modalRevisionInstance) {
        modalRevisionInstance.hide(); 
    }
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

// =========================================================================
// RECURSO ACADÉMICO: EXPORTACIÓN DE CONSOLIDADO GENERAL DE CALIFICACIONES
// =========================================================================
window.exportarConsolidadoCalificacionesCSV = async function() {
    // Verificar que exista un curso seleccionado activamente
    if (!cursoActivoId) {
        alert("⚠️ Por favor, selecciona un curso antes de exportar el consolidado de notas.");
        return;
    }

    try {
        // 1. Obtener todas las tareas programadas para este curso (Columnas dinámicas)
        const { data: tareas, error: errTareas } = await supabase
            .from('tareas')
            .select('id, titulo, nota_maxima')
            .eq('curso_id', cursoActivoId)
            .order('created_at', { ascending: true });

        if (errTareas) throw errTareas;

        if (!tareas || tareas.length === 0) {
            alert("⚠️ Este curso aún no registra tareas creadas para poder consolidar.");
            return;
        }

        // 2. Obtener la nómina de estudiantes matriculados aprobados en este curso
        const { data: inscripciones, error: errInsc } = await supabase
            .from('inscripciones')
            .select(`
                perfil_id,
                perfiles (
                    id,
                    nombre_apellido
                )
            `)
            .eq('curso_id', cursoActivoId)
            .eq('estado', 'aprobado');

        if (errInsc) throw errInsc;

        if (!inscripciones || inscripciones.length === 0) {
            alert("⚠️ No hay estudiantes matriculados y aprobados en este curso.");
            return;
        }

        // Extraer y ordenar alfabéticamente a los alumnos por apellido/nombre
        const listaEstudiantes = inscripciones
            .map(ins => ins.perfiles)
            .filter(p => p !== null)
            .sort((a, b) => a.nombre_apellido.localeCompare(b.nombre_apellido));

        // 3. Obtener TODAS las entregas/calificaciones existentes de este curso de forma masiva
        const idTareasCurso = tareas.map(t => t.id);
        const { data: entregas, error: errEntregas } = await supabase
            .from('tarea_entregas')
            .select('tarea_id, perfil_id, nota_asignada')
            .in('tarea_id', idTareasCurso);

        if (errEntregas) throw errEntregas;

        // Mapear entregas en un diccionario indexado de doble llave [perfil_id][tarea_id] para acceso O(1) rápido
        const mapaNotas = {};
        if (entregas) {
            entregas.forEach(ent => {
                if (!mapaNotas[ent.perfil_id]) mapaNotas[ent.perfil_id] = {};
                mapaNotas[ent.perfil_id][ent.tarea_id] = ent.nota_asignada;
            });
        }

        // 4. Construir las cabeceras dinámicas del CSV
        // Estructura: Estudiante ; Tarea 1 (Max 10) ; Tarea 2 (Max 10) ... ; PROMEDIO FINAL
        let cabeceras = "Estudiante";
        tareas.forEach(t => {
            cabeceras += `;"${t.titulo} (Max ${t.nota_maxima})"`;
        });
        cabeceras += ";Promedio General\r\n";

        let contenidoCSV = cabeceras;

        // 5. Procesar fila por fila a cada alumno matriculado
        listaEstudiantes.forEach(estudiante => {
            let fila = `"${estudiante.nombre_apellido}"`;
            let sumaNotas = 0;
            let totalTareas = tareas.length;

            tareas.forEach(t => {
                // Verificar si el alumno tiene nota en esta tarea específica, sino asignar 0 (Pendiente)
                const nota = (mapaNotas[estudiante.id] && mapaNotas[estudiante.id][t.id] !== undefined && mapaNotas[estudiante.id][t.id] !== null)
                    ? mapaNotas[estudiante.id][t.id] 
                    : 0;
                
                fila += `;${nota.toFixed(2)}`;
                sumaNotas += nota;
            });

            // Calcular promedio aritmético simple de la fila
            const promedio = totalTareas > 0 ? (sumaNotas / totalTareas) : 0;
            fila += `;${promedio.toFixed(2)}\r\n`;

            contenidoCSV += fila;
        });

        // 6. Obtener el nombre del curso del DOM para bautizar el archivo descargado
        const selectCurso = document.getElementById("select-curso"); // Asegúrate que este sea el ID de tu selector de cursos de profesor
        const nombreCurso = selectCurso ? selectCurso.options[selectCurso.selectedIndex].text : "Curso";
        const nombreArchivoLimpio = nombreCurso.replace(/[/\\?%*:|"<>]/g, '-').trim();

        // 7. Empaquetar binario e inyectar el BOM UTF-8 (\uFEFF) para garantizar total compatibilidad con Excel
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), contenidoCSV], { type: "text/csv;charset=utf-8;" });
        const linkDescarga = document.createElement("a");

        if (linkDescarga.download !== undefined) {
            const url = URL.createObjectURL(blob);
            linkDescarga.setAttribute("href", url);
            linkDescarga.setAttribute("download", `Consolidado_Notas_${nombreArchivoLimpio}.csv`);
            linkDescarga.style.visibility = 'hidden';
            
            document.body.appendChild(linkDescarga);
            linkDescarga.click();
            document.body.removeChild(linkDescarga);
        }

    } catch (error) {
        console.error("Error en la consolidación de calificaciones:", error.message);
        alert("❌ Error al consolidar el archivo centralizado: " + error.message);
    }
};
// =========================================================================
// VARIABLES DE CONTROL GLOBAL DE ESTADO
// =========================================================================
let cursoActivoId = null;
let vistaActual = 'recursos';
let estudianteId = null;       // ID del perfil del estudiante autenticado
let modalForoInstance = null;  // Instancia de control nativo del modal Bootstrap
let foroActivoSeleccionadoId = null; // ID del foro en visualización activa

// =========================================================================
// GESTOR DE EVENTOS INICIALES (DOM CONTENT LOADED)
// =========================================================================
document.addEventListener("DOMContentLoaded", async () => {
    await inicializarPanelEstudiante();

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", cerrarSesionEstudiante);
    }

    // Interceptor del formulario de aportaciones al foro
    const formComentario = document.getElementById("form-comentario-estudiante");
    if (formComentario) {
        formComentario.addEventListener("submit", publicarComentarioForo);
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

        estudianteId = user.id; // Almacenamos la variable de sesión

        // 1. Recuperamos los datos del perfil del alumno
        const { data: perfil, error: perfilError } = await supabase
            .from('perfiles')
            .select('nombre_apellido, rol')
            .eq('id', user.id)
            .single();

        if (perfilError) throw perfilError;

        // Seguridad: Si no es estudiante, lo expulsamos de la ruta
        if (perfil.role !== 'estudiante' && perfil.rol !== 'estudiante') {
            await supabase.auth.signOut();
            window.location.href = "index.html";
            return;
        }
        
        const txtNombreEstudiante = document.getElementById("estudiante-name");
        if (txtNombreEstudiante) {
            txtNombreEstudiante.innerHTML = `<i class="bi bi-mortarboard-fill me-1"></i> Alumno: ${perfil.nombre_apellido}`;
        }

        // 2. INNER JOIN RELACIONAL: Buscamos las inscripciones aprobadas del alumno
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
// CONTROLADORES DE INTERFAZ ACTIVA MULTI-PESTAÑA (UI)
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

    cargarDatosSubVista();
}

window.cambiarSubVista = function(vista) {
    vistaActual = vista;
    
    // Sincronizar clases active de las pestañas
    const tabs = ['recursos', 'foros', 'tareas'];
    tabs.forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        if (tabEl) tabEl.classList.toggle("active", vista === t);
    });

    // Sincronizar visibilidad de los contenedores contenedores card
    tabs.forEach(v => {
        const viewEl = document.getElementById(`vista-${v}`);
        if (viewEl) viewEl.classList.toggle("d-none", vista !== v);
    });

    cargarDatosSubVista();
}

function cargarDatosSubVista() {
    if (!cursoActivoId) return;
    
    if (vistaActual === 'recursos') {
        cargarRecursosEstudiante();
    } else if (vistaActual === 'foros') {
        cargarForosEstudiante();
    } else if (vistaActual === 'tareas') {
        cargarTareasEstudiante();
    }
}

// =========================================================================
// MÓDULO A: VISUALIZACIÓN DE RECURSOS (FILTRADO POR VISIBILIDAD)
// =========================================================================
async function cargarRecursosEstudiante() {
    try {
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
        console.error("Error al renderizar los recursos:", error.message);
    }
}

// =========================================================================
// MÓDULO B: SISTEMA COMPLETO DE FOROS ACADÉMICOS DE DEBATE
// =========================================================================
async function cargarForosEstudiante() {
    try {
        const { data: foros, error } = await supabase
            .from('foros')
            .select('*')
            .eq('curso_id', cursoActivoId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById("tabla-foros-estudiante-body");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!foros || foros.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">No hay foros de discusión creados en este curso.</td></tr>`;
            return;
        }

        foros.forEach(foro => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <span class="fw-bold text-dark d-block">${foro.titulo}</span>
                    <small class="text-muted text-truncate d-inline-block" style="max-width: 500px;">${foro.descripcion}</small>
                </td>
                <td><span class="badge bg-light text-secondary border"><i class="bi bi-calendar-event me-1"></i>${foro.fecha_limite}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-primary rounded-pill px-3 fw-medium" onclick="window.abrirModalForoAlumno(${foro.id}, '${foro.titulo.replace(/'/g, "\\'")}', '${foro.descripcion.replace(/'/g, "\\'")}', '${foro.fecha_limite}')">
                        <i class="bi bi-chat-left-quote-fill me-1"></i> Entrar al Debate
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Error al renderizar foros para estudiantes: ", e.message);
    }
}

window.abrirModalForoAlumno = async function(idForo, titulo, descripcion, fechaLimite) {
    foroActivoSeleccionadoId = idForo;
    document.getElementById("modalRespuestasLabel").innerText = titulo;
    document.getElementById("modal-foro-fecha").innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i> Participaciones habilitadas hasta: <b>${fechaLimite}</b>`;
    document.getElementById("modal-foro-descripcion").innerText = descripcion;

    // Resetear formulario nativo de ingreso de datos
    const txtMsg = document.getElementById("foro-mensaje-estudiante");
    if (txtMsg) txtMsg.value = "";

    await recargarComentariosMismoForo();

    if (!modalForoInstance) {
        modalForoInstance = new bootstrap.Modal(document.getElementById('modalRespuestasForo'));
    }
    modalForoInstance.show();
}

async function recargarComentariosMismoForo() {
    const contenedor = document.getElementById("contenedor-comentarios-foro");
    if (!contenedor) return;
    contenedor.innerHTML = `<div class="text-center py-3"><div class="spinner-border text-primary spinner-border-sm"></div> Cargando aportaciones...</div>`;

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
            .eq('foro_id', foroActivoSeleccionadoId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        contenedor.innerHTML = "";

        if (!comentarios || comentarios.length === 0) {
            contenedor.innerHTML = `<div class="alert alert-light text-center border-dashed py-3 text-muted small"><i class="bi bi-chat-quote"></i> Nadie ha comentado todavía. ¡Sé el primero en aportar!</div>`;
            return;
        }

        comentarios.forEach(com => {
            const autor = com.perfiles;
            const esDocenteOAdmin = autor && (autor.rol === 'docente' || autor.rol === 'admin');
            
            const fondoCaja = esDocenteOAdmin ? 'bg-primary-subtle border-primary-subtle text-dark' : 'bg-white border-light-subtle';
            const badgeAutor = esDocenteOAdmin ? `<span class="badge bg-primary ms-1">Docente</span>` : '';
            const fechaFormateada = new Date(com.created_at).toLocaleString();

            const divMsg = document.createElement("div");
            divMsg.className = `p-2.5 rounded border shadow-sm small ${fondoCaja}`;
            divMsg.style.padding = "10px";
            divMsg.innerHTML = `
                <div class="d-flex align-items-center justify-content-between mb-1 border-bottom pb-1">
                    <span class="fw-bold text-dark text-truncate" style="max-width:70%;"><i class="bi bi-person-fill text-secondary me-1"></i>${autor ? autor.nombre_apellido : 'Usuario'} ${badgeAutor}</span>
                    <span class="text-muted" style="font-size: 0.7rem;"><i class="bi bi-clock me-1"></i>${fechaFormateada}</span>
                </div>
                <p class="mb-0 text-secondary style-justify" style="white-space: pre-line;">${com.mensaje}</p>
            `;
            contenedor.appendChild(divMsg);
        });

        // Auto Scroll automático al final de la conversación del foro
        contenedor.scrollTop = contenedor.scrollHeight;

    } catch (e) {
        contenedor.innerHTML = `<div class="alert alert-danger small">Error: ${e.message}</div>`;
    }
}

async function publicarComentarioForo(e) {
    e.preventDefault();
    if (!foroActivoSeleccionadoId || !estudianteId) return;

    const mensaje = document.getElementById("foro-mensaje-estudiante").value.trim();

    try {
        const { error } = await supabase
            .from('foro_respuestas')
            .insert([{ foro_id: foroActivoSeleccionadoId, perfil_id: estudianteId, mensaje }]);

        if (error) throw error;

        document.getElementById("foro-mensaje-estudiante").value = "";
        await recargarComentariosMismoForo();

    } catch (err) {
        alert("Error al enviar comentario: " + err.message);
    }
}

window.cerrarModalForo = function() {
    if (modalForoInstance) modalForoInstance.hide();
}

// =========================================================================
// MÓDULO C: GESTIÓN DE TAREAS INTEGRADAS CON GOOGLE FORMS DINÁMICO
// =========================================================================
async function cargarTareasEstudiante() {
    try {
        // 1. Obtener todas las tareas programadas en la asignatura
        const { data: tareas, error: errTar } = await supabase
            .from('tareas')
            .select('*')
            .eq('curso_id', cursoActivoId)
            .order('fecha_entrega', { ascending: true });

        if (errTar) throw errTar;

        const tbody = document.getElementById("tabla-tareas-estudiante-body");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!tareas || tareas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Felicidades, el docente no ha cargado tareas pendientes en esta asignatura.</td></tr>`;
            return;
        }

        // 2. Cruzar información con las confirmaciones del alumno autenticado
        const { data: entregas, error: errEnt } = await supabase
            .from('tarea_entregas')
            .select('*')
            .eq('perfil_id', estudianteId);

        if (errEnt) throw errEnt;

        const mapaEntregas = {};
        if (entregas) {
            entregas.forEach(e => mapaEntregas[e.tarea_id] = e);
        }

        tareas.forEach(t => {
            const registroEntrega = mapaEntregas[t.id];
            const haEntregado = !!registroEntrega;

            // Gestión visual de estados
            let badgeEstado = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-exclamation-triangle-fill"></i> Pendiente</span>`;
            let txtNota = `<span class="text-muted small">Sin calificar</span>`;
            let btnAccion = `<button class="btn btn-sm btn-success rounded-pill px-3 fw-bold mb-1 w-100" onclick="window.abrirFormularioYConfirmar(${t.id}, '${t.url_formulario_google}')"><i class="bi bi-pencil-square"></i> Realizar Tarea</button>`;

            if (haEntregado) {
                badgeEstado = `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle-fill"></i> Entregado</span>`;
                
                // Evaluar si ya tiene nota asignada por el maestro
                if (registroEntrega.nota_asignada !== null && registroEntrega.nota_asignada !== undefined) {
                    txtNota = `<b class="text-primary">${registroEntrega.nota_asignada.toFixed(2)}</b> / <small class="text-secondary">${t.nota_maxima}</small>`;
                    
                    if (registroEntrega.retroalimentacion) {
                        txtNota += `<br><small class="text-muted d-block" style="font-size:0.75rem;"><b>Obs:</b> ${registroEntrega.retroalimentacion}</small>`;
                    }
                }

                // El estudiante puede re-confirmar o ver el formulario si lo requiere
                btnAccion = `<a href="${t.url_formulario_google}" target="_blank" class="btn btn-sm btn-outline-secondary rounded-pill px-3 w-100" style="font-size:0.8rem;"><i class="bi bi-eye"></i> Ver Formulario</a>`;
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <span class="fw-bold text-dark d-block">${t.titulo}</span>
                    <small class="text-muted d-block text-wrap" style="max-width:350px;">${t.descripcion}</small>
                </td>
                <td><span class="text-secondary small fw-medium">${t.fecha_entrega.split('T')[0]}</span></td>
                <td>${badgeEstado}</td>
                <td>${txtNota}</td>
                <td class="text-end">${btnAccion}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Error crítico en el renderizado de tareas de alumnos: ", e.message);
    }
}

window.abrirFormularioYConfirmar = async function(idTarea, urlGoogleForm) {
    // 1. Abrir de inmediato el Formulario de Google en otra pestaña para que realice la carga del PDF
    window.open(urlGoogleForm, '_blank');

    // 2. Solicitar de forma nativa la confirmación en pantalla
    const comentario = prompt("Acabas de abrir el Google Form.\n\nUna vez que subas tu archivo PDF y le des clic al botón 'Enviar' dentro del formulario de Google, regresa a esta ventana y escribe un comentario opcional (Ej: 'Envío completado') para registrar tu entrega en el Aula Virtual:");
    
    if (comentario === null) return; // Si cancela el prompt, no se registra nada

    try {
        // Ejecutamos un upsert sobre la tabla relacional tarea_entregas
        const { error } = await supabase
            .from('tarea_entregas')
            .upsert({
                tarea_id: Number(idTarea),
                perfil_id: estudianteId,
                comentario_estudiante: comentario.trim() || "Entrega registrada vía formulario propio."
            }, { onConflict: 'tarea_id, perfil_id' });

        if (error) throw error;

        alert("¡Felicidades! Tu entrega ha sido notificada al docente con éxito en el sistema central de Grucomer.");
        await cargarTareasEstudiante(); // Recargar cuadrícula en caliente

    } catch (err) {
        alert("Error al sincronizar tu entrega: " + err.message);
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
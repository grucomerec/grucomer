/**
 * =========================================================================
 * GRUCOMER - CONTROLADOR CENTRAL DEL PANEL DE ADMINISTRACIÓN (admin.js)
 * =========================================================================
 */

// Variable global para auditoría, reportes y purga masiva
let alumnosCargadosActualmente = []; 

// ==========================================
// BLOQUE 1: INICIALIZACIÓN Y SEGURIDAD (DOM)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  // Verificar sesión activa en Supabase Auth
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) { 
    window.location.href = "index_a_v.html"; 
    return; 
  }

  // Validar el rol estricto de Administrador
  const { data: perfilAdmin } = await supabaseClient
    .from('perfiles')
    .select('nombre_apellido, rol')
    .eq('id', user.id)
    .single();

  if (!perfilAdmin || perfilAdmin.rol !== 'admin') { 
    await supabaseClient.auth.signOut(); 
    window.location.href = "index_a_v .html"; 
    return; 
  }

  // Desplegar nombre del administrador logueado
  document.getElementById("admin-name").innerHTML = `<i class="bi bi-person-circle me-1"></i> ${perfilAdmin.nombre_apellido}`;

  // Inicializar entorno por defecto (Pestaña Solicitudes)
  cargarSolicitudes();

  // Escuchadores de envío (Submit) para registros en ventanas modales
  document.getElementById("form-docente").addEventListener("submit", agregarDocente);
  document.getElementById("form-curso").addEventListener("submit", agregarCurso);
  
  // Escuchador para el botón de cierre de sesión seguro
  document.getElementById("btn-logout").addEventListener("click", async (e) => { 
    e.preventDefault();
    await supabaseClient.auth.signOut(); 
    window.location.href = "index.html"; 
  });
});


// ==========================================
// BLOQUE 2: CONTROLADOR DE VISTAS Y NAVEGACIÓN
// ==========================================
window.cambiarVista = function(vista) {
  const vistas = ['solicitudes', 'docentes', 'cursos', 'matriculados'];
  
  // Ocultar y remover clases activas de todas las secciones
  vistas.forEach(v => {
    document.getElementById(`tab-${v}`).classList.remove("active");
    document.getElementById(`vista-${v}`).classList.add("d-none");
  });
  
  // Activar visualmente la sección elegida
  document.getElementById(`tab-${vista}`).classList.add("active");
  document.getElementById(`vista-${vista}`).classList.remove("d-none");

  // Gatillar cargas de datos específicas según el entorno activo
  if (vista === 'solicitudes') cargarSolicitudes();
  if (vista === 'docentes') cargarDocentes();
  if (vista === 'cursos') cargarCursos();
  if (vista === 'matriculados') inicializarFiltroCursos();
};


// ==========================================
// BLOQUE 3: ENTORNO DE SOLICITUDES PENDIENTES (CORREGIDO)
// ==========================================
async function cargarSolicitudes() {
  try {
    console.log("Comenzando carga de solicitudes pendientes...");

    const { data: inscripcionesPendientes, error: errQuery } = await supabaseClient
      .from('inscripciones')
      .select(`
        id,
        estado,
        perfiles (id, cedula, nombre_apellido, celular, correo_personal),
        cursos (nombre_curso)
      `)
      .ilike('estado', '%pendiente%');

    if (errQuery) {
      console.error("Error devuelto por Supabase:", errQuery.message);
      throw errQuery;
    }

    const tbody = document.getElementById("tabla-pendientes-body");
    tbody.innerHTML = "";

    if (!inscripcionesPendientes || inscripcionesPendientes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No hay solicitudes de inscripción pendientes en este momento.</td></tr>`;
      return;
    }

    inscripcionesPendientes.forEach((item) => {
      const alumno = item.perfiles;
      const curso = item.cursos;

      const nombreAlumno = alumno ? alumno.nombre_apellido : "⚠️ Perfil Protegido por RLS";
      const correoAlumno = alumno ? alumno.correo_personal : "N/A";
      const cedulaAlumno = alumno ? alumno.cedula : "N/A";
      const celularAlumno = alumno ? alumno.celular : "N/A";
      const nombreCurso = curso ? curso.nombre_curso : "⚠️ Curso Protegido por RLS";
      
      // Capturamos el UUID del alumno desde la relación de perfiles
      const perfilId = alumno ? alumno.id : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="fw-bold text-dark">${nombreAlumno}</div>
          <div class="text-muted small">${correoAlumno}</div>
        </td>
        <td><code>${cedulaAlumno}</code></td>
        <td><span class="badge bg-light text-dark border">${celularAlumno}</span></td>
        <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle">${nombreCurso}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-success fw-bold me-1 btn-aprobar" data-id="${item.id}" data-perfil="${perfilId}">
            <i class="bi bi-check-lg"></i> Aprobar
          </button>
          <button class="btn btn-sm btn-outline-danger fw-bold btn-rechazar" data-id="${item.id}" data-perfil="${perfilId}">
            <i class="bi bi-x-lg"></i> Rechazar
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Enlace reactivo de eventos pasando tanto el ID de inscripción como el de perfil
    tbody.querySelectorAll(".btn-aprobar").forEach(btn => {
      btn.addEventListener("click", () => window.procesarSolicitud(btn.dataset.id, btn.dataset.perfil, 'aprobado'));
    });
    tbody.querySelectorAll(".btn-rechazar").forEach(btn => {
      btn.addEventListener("click", () => window.procesarSolicitud(btn.dataset.id, btn.dataset.perfil, 'rechazado'));
    });

  } catch (error) {
    console.error("Fallo general al procesar solicitudes:", error.message);
  }
}

// PROCESADOR INTEGRAL DE ESTADOS (MODIFICACIÓN TRANSACTIONAL DOBLE)
window.procesarSolicitud = async function(inscripcionId, perfilId, nuevoEstado) {
  if (!inscripcionId) return;
  if (!confirm(`¿Desea cambiar el estado de la inscripción y del perfil a "${nuevoEstado}"?`)) return;
  
  try {
    const idFormateado = isNaN(inscripcionId) ? inscripcionId : Number(inscripcionId);

    // 1. Preparar la tarea de actualización para la tabla Inscripciones
    const tareaInscripcion = supabaseClient
      .from('inscripciones')
      .update({ estado: nuevoEstado })
      .eq('id', idFormateado);

    // 2. Preparar la tarea para la tabla Perfiles (Si el ID relacional es válido)
    let tareaPerfil = null;
    if (perfilId && perfilId !== "null" && perfilId !== "undefined") {
      tareaPerfil = supabaseClient
        .from('perfiles')
        .update({ estado: nuevoEstado })
        .eq('id', perfilId);
    }

    // Ejecución asíncrona paralela (Se resuelven de forma simultánea en Supabase)
    if (tareaPerfil) {
      const [resInscripcion, resPerfil] = await Promise.all([tareaInscripcion, tareaPerfil]);
      if (resInscripcion.error) throw resInscripcion.error;
      if (resPerfil.error) throw resPerfil.error;
    } else {
      const resInscripcion = await tareaInscripcion;
      if (resInscripcion.error) throw resInscripcion.error;
    }
    
    alert(`¡Éxito! La inscripción y el perfil de acceso cambiaron a estado "${nuevoEstado}".`); 
    cargarSolicitudes(); 
    
  } catch (error) {
    alert("Error al sincronizar los estados en la base de datos: " + error.message);
  }
};


// ==========================================
// BLOQUE 4: ENTORNO GESTIÓN DE DOCENTES
// ==========================================
async function cargarDocentes() {
  try {
    const { data: docentes, error } = await supabaseClient
      .from('perfiles')
      .select('*')
      .eq('rol', 'docente');

    if (error) throw error;

    const tbody = document.getElementById("tabla-docentes-body");
    tbody.innerHTML = "";

    if (!docentes || docentes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-muted">No hay docentes registrados en el sistema.</td></tr>`;
      return;
    }

    docentes.forEach(doc => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="fw-bold text-dark">${doc.nombre_apellido}</td>
        <td><code>${doc.cedula}</code></td>
        <td>${doc.celular}</td>
        <td>${doc.correo_personal}</td>
        <td class="text-primary fw-semibold"><i class="bi bi-envelope-check me-1"></i>${doc.correo_institucional}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger btn-eliminar-docente" data-id="${doc.id}">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".btn-eliminar-docente").forEach(btn => {
      btn.addEventListener("click", () => window.eliminarPerfil(btn.dataset.id, 'docente'));
    });

  } catch (error) {
    console.error("Error al listar nómina de docentes:", error.message);
  }
}

async function agregarDocente(e) {
  e.preventDefault();
  
  const cedula = document.getElementById("doc-cedula").value.trim();
  const nombre = document.getElementById("doc-nombre").value.trim();
  const celular = document.getElementById("doc-celular").value.trim();
  const correo = document.getElementById("doc-correo").value.trim();
  
  const correoInst = `d${cedula}@grucomer.com`; 
  const claveTemporal = `d.${cedula}`; 

  try {
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email: correoInst,
      password: claveTemporal,
    });

    if (authError) throw authError;

    const { error: perfilError } = await supabaseClient.from('perfiles').insert([{
      id: authData.user.id,
      cedula, 
      nombre_apellido: nombre, 
      celular, 
      correo_personal: correo, 
      correo_institucional: correoInst, 
      rol: 'docente', 
      estado: 'aprobado' 
    }]);

    if (perfilError) throw perfilError;

    alert(`¡Docente registrado exitosamente!\n\n📧 Usuario: ${correoInst}\n🔑 Clave Temporal: ${claveTemporal}`);
    
    document.getElementById("form-docente").reset();
    bootstrap.Modal.getInstance(document.getElementById("modalDocente")).hide();
    cargarDocentes();

  } catch (err) {
    alert("⚠️ Error en el registro de docente: " + err.message);
  }
}


// ==========================================
// BLOQUE 5: ENTORNO GESTIÓN DE CURSOS Y ASIGNACIÓN
// ==========================================
async function cargarCursos() {
  try {
    const { data: cursos } = await supabaseClient.from('cursos').select('*').order('nombre_curso', { ascending: true });
    const { data: docentes } = await supabaseClient.from('perfiles').select('id, nombre_apellido').eq('rol', 'docente');

    const tbody = document.getElementById("tabla-cursos-body");
    tbody.innerHTML = "";

    if (!cursos || cursos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3 text-muted">No hay cursos creados en la oferta académica.</td></tr>`;
      return;
    }

    cursos.forEach(curso => {
      let opcionesDocentes = `<option value="">-- Sin asignar --</option>`;
      docentes.forEach(doc => {
        opcionesDocentes += `<option value="${doc.id}" ${curso.docente_id === doc.id ? 'selected' : ''}>${doc.nombre_apellido}</option>`;
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><small class="text-muted"><code>${curso.id}</code></small></td>
        <td class="fw-bold text-dark">${curso.nombre_curso}</td>
        <td>
          <select class="form-select form-select-sm select-asignar-docente" data-curso="${curso.id}">
            ${opcionesDocentes}
          </select>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger btn-eliminar-curso" data-id="${curso.id}">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".select-asignar-docente").forEach(select => {
      select.addEventListener("change", (e) => {
        window.asignarDocenteACurso(select.dataset.curso, e.target.value);
      });
    });

    tbody.querySelectorAll(".btn-eliminar-curso").forEach(btn => {
      btn.addEventListener("click", () => window.eliminarCurso(btn.dataset.id));
    });

  } catch (error) {
    console.error("Error al cargar oferta de cursos:", error.message);
  }
}

async function agregarCurso(e) {
  e.preventDefault();
  const nombre_curso = document.getElementById("curso-nombre").value.trim();
  
  const { error } = await supabaseClient.from('cursos').insert([{ nombre_curso }]);
  if (error) {
    alert("Error al guardar curso: " + error.message);
  } else { 
    document.getElementById("form-curso").reset(); 
    bootstrap.Modal.getInstance(document.getElementById("modalCurso")).hide(); 
    cargarCursos(); 
  }
}

window.asignarDocenteACurso = async function(cursoId, docenteId) {
  const valDocente = docenteId === "" ? null : docenteId;
  const { error } = await supabaseClient.from('cursos').update({ docente_id: valDocente }).eq('id', cursoId);
  if (error) alert("Error de asignación: " + error.message);
};

window.eliminarCurso = async function(id) {
  if (!confirm("¿Seguro que desea eliminar este curso? Las inscripciones asociadas se romperán.")) return;
  await supabaseClient.from('cursos').delete().eq('id', id);
  cargarCursos();
};


// ==========================================
// BLOQUE 6: GESTIÓN DE ALUMNOS MATRICULADOS Y PURGA COMPLETA
// ==========================================
async function inicializarFiltroCursos() {
  const { data: cursos } = await supabaseClient.from('cursos').select('id, nombre_curso').order('nombre_curso', { ascending: true });
  const select = document.getElementById("select-filtro-curso");
  select.innerHTML = '<option value="">-- Seleccione un curso --</option>';
  
  cursos.forEach(c => {
    const opt = document.createElement("option"); 
    opt.value = c.id; 
    opt.innerText = c.nombre_curso; 
    select.appendChild(opt);
  });

  document.getElementById("btn-exportar-curso").onclick = exportarCursoACSV;
  document.getElementById("btn-vaciar-curso").onclick = vaciarCursoMasivo;
}

window.cargarMatriculadosPorCurso = async function(cursoId) {
  const tbody = document.getElementById("tabla-matriculados-body");
  const btnExportar = document.getElementById("btn-exportar-curso");
  const btnVaciar = document.getElementById("btn-vaciar-curso");

  if (!cursoId) { 
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">Seleccione un curso del menú superior para auditar la lista.</td></tr>`; 
    btnExportar.disabled = true;
    btnVaciar.disabled = true;
    alumnosCargadosActualmente = [];
    return; 
  }

  const { data: inscritos, error } = await supabaseClient
    .from('inscripciones')
    .select('id, estado, perfiles!inner(id, cedula, nombre_apellido, celular, correo_personal)')
    .eq('curso_id', cursoId)
    .eq('estado', 'aprobado');

  if (error) {
    console.error(error.message);
    return;
  }

  tbody.innerHTML = "";
  
  if (!inscritos || inscritos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No hay alumnos activos matriculados en este curso.</td></tr>`; 
    btnExportar.disabled = true;
    btnVaciar.disabled = true;
    alumnosCargadosActualmente = [];
    return;
  }

  alumnosCargadosActualmente = inscritos;
  btnExportar.disabled = false;
  btnVaciar.disabled = false;

  inscritos.forEach(item => {
    const alumno = item.perfiles;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="fw-bold text-dark">${alumno.nombre_apellido}</td>
      <td><code>${alumno.cedula}</code></td>
      <td>${alumno.celular}</td>
      <td>${alumno.correo_personal}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-danger btn-baja" data-inscripcion="${item.id}">
          <i class="bi bi-person-x"></i> Dar de Baja
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-baja").forEach(btn => {
    btn.addEventListener("click", () => {
      window.removerMatriculaEstudiante(btn.dataset.inscripcion);
    });
  });
};

window.removerMatriculaEstudiante = async function(inscripcionId) {
  if (!confirm("¿Está seguro de dar de baja a este estudiante? Regresará al panel de solicitudes pendientes.")) return;
  
  try {
    const { error } = await supabaseClient
      .from('inscripciones')
      .update({ estado: 'pendiente' })
      .eq('id', inscripcionId);

    if (error) throw error;

    alert("Estudiante dado de baja con éxito.");
    
    const cursoSeleccionado = document.getElementById("select-filtro-curso").value;
    window.cargarMatriculadosPorCurso(cursoSeleccionado);
    cargarSolicitudes(); 

  } catch (error) {
    alert("Imposible dar de baja: " + error.message);
  }
};

function exportarCursoACSV() {
  if (alumnosCargadosActualmente.length === 0) return;

  const selectCurso = document.getElementById("select-filtro-curso");
  const textCurso = selectCurso.options[selectCurso.selectedIndex].text.replace(/\s+/g, '_');

  let csvContent = "\uFEFF"; 
  csvContent += "Nombre y Apellido,Cedula,Celular,Correo Personal\n";

  alumnosCargadosActualmente.forEach(item => {
    const al = item.perfiles;
    csvContent += `"${al.nombre_apellido}","${al.cedula}","${al.celular}","${al.correo_personal}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Alumnos_${textCurso}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// =========================================================================
// FUNCIÓN DE PURGA COMPLETA MEDIANTE RPC (VACIAR Y ELIMINAR CURSO)
// =========================================================================
async function vaciarCursoMasivo() {
  const selectCurso = document.getElementById("select-filtro-curso");
  const cursoId = selectCurso.value;
  const nombreCurso = selectCurso.options[selectCurso.selectedIndex].text;

  if (!cursoId) return;

  const confirmacionPrimera = confirm(`⚠️ ADVERTENCIA GLOBAL DE PURGA:\n\n¿Desea vaciar totalmente el curso "${nombreCurso}"?\nEsta acción eliminará de forma irreversible a los ${alumnosCargadosActualmente.length} estudiantes de:\n1. La lista del curso (Inscripciones).\n2. La Base de Datos (perfiles).\n3. El sistema de Autenticación de Grucomer (auth.users).`);
  if (!confirmacionPrimera) return;

  try {
    console.log(`📡 [Purga RPC] Solicitando vaciado integral del curso ID: ${cursoId}`);

    const { error } = await supabaseClient.rpc('vaciar_curso_completo_rpc', {
      p_curso_id: Number(cursoId)
    });

    if (error) throw error;

    alert(`🚀 Operación exitosa. El curso "${nombreCurso}" ha sido vaciado. Los perfiles y credenciales de sus alumnos se destruyeron de los servidores de Grucomer.`);
    
    window.cargarMatriculadosPorCurso(cursoId);
    cargarSolicitudes();

  } catch (error) {
    console.error("❌ Error en la purga masiva por RPC:", error);
    alert("Ocurrió un error en la purga masiva de datos: " + error.message);
  }
}

window.eliminarPerfil = async function(id, tipo) {
  if (!id) return;

  if (!confirm(`⚠️ ¿ESTÁS SEGURO?\n\nEsta acción eliminará permanentemente al ${tipo} de:\n1. La lista de registros (perfiles).\n2. Sus accesos y credenciales de Grucomer (auth.users).\n\nEsta operación no se puede deshacer.`)) return;

  try {
    console.log(`📡 [Eliminación RPC] Iniciando borrado completo para el ${tipo} con ID: ${id}`);

    if (tipo === 'docente') {
      const { error } = await supabaseClient.rpc('eliminar_docente_completo_rpc', {
        p_docente_id: id
      });

      if (error) throw error;
      
      alert("🚀 Docente y credenciales de acceso eliminados con éxito del servidor.");
      cargarDocentes();

    } else {
      const { error } = await supabaseClient.from('perfiles').delete().eq('id', id);
      if (error) throw error;
      alert("Registro eliminado con éxito.");
    }

  } catch (error) {
    console.error(`❌ Error al eliminar el ${tipo}:`, error);
    alert(`No se pudo procesar la eliminación del docente: ${error.message}`);
  }
};
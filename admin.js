const SUPA_URL='https://xtotumsgwvltagwdwyuh.supabase.co';
const SUPA_KEY='sb_publishable_i80iCeD0hfF3P38YlObsJg_runGr68-';
const sb=supabase.createClient(SUPA_URL,SUPA_KEY);

const state={user:null,profile:null,empleados:[],marcajes:[],vacaciones:[],ausencias:[],solicitudes:[],solicitudesReporte:[],solicitudesGestion:[],tiposPerfil:[],ubicaciones:[],capsulas:[],convocatorias:[],candidatos:[],convocatoriaActual:null,resumen:[],sinUso:[],fuera:[],charts:{},encuestas:[]};
let encPreguntas=[];
const DEFAULT_PERMISOS={
  empleado:{app:['checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas','mis_solicitudes','encuestas'],consola:[]},
  jefe:{app:['checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas','autorizar_vacaciones','mis_solicitudes','encuestas'],consola:[]},
  rrhh:{app:['checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas','mis_solicitudes','encuestas'],consola:['dashboard','empleados','asistencia','ubicaciones','capsulas','seleccion','solicitudes','notificaciones','reportes','encuestas']},
  admin:{app:['checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas','autorizar_vacaciones','mis_solicitudes','encuestas'],consola:['dashboard','empleados','asistencia','ubicaciones','capsulas','seleccion','solicitudes','notificaciones','reportes','perfiles','encuestas','configuracion']}
};
const CONSOLA_MODULOS=['dashboard','empleados','asistencia','ubicaciones','capsulas','seleccion','solicitudes','notificaciones','reportes','encuestas','configuracion','perfiles'];
const APP_MODULOS=['checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas','autorizar_vacaciones','mis_solicitudes','encuestas'];
const NOTIF_TEMPLATES={
  quincena:{
    titulo:'Deposito de quincena realizado',
    mensaje:'Hola. Te informamos que el Deposito correspondiente a tu quincena ya fue realizado. Por favor verifica la acreditacion en tu cuenta bancaria. Si observas alguna diferencia, comunicate con RRHH.'
  },
  finmes:{
    titulo:'Deposito de fin de mes realizado',
    mensaje:'Hola. Tu Deposito de fin de mes ya fue procesado. Te recomendamos validar el movimiento en tu cuenta bancaria y conservar tu comprobante para cualquier consulta.'
  },
  marcajes:{
    titulo:'Recordatorio de marcajes diarios',
    mensaje:'Recuerda realizar tus marcajes de entrada, salida a almuerzo, regreso de almuerzo y salida final. Mantener tus registros completos nos ayuda a validar correctamente tu jornada laboral.'
  }
};

function todayISO(){return new Date().toISOString().slice(0,10)}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.className='show';setTimeout(()=>t.className='',2600)}
function timeToMin(v){const [h,m]=String(v||'00:00').split(':').map(Number);return (h||0)*60+(m||0)}
function minToTime(min){if(min===null||min===undefined||Number.isNaN(min))return '';const h=Math.floor(min/60),m=min%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
function diffMin(a,b){return a!==null&&b!==null?Math.max(0,b-a):null}
function tipoMarcaje(v){const t=String(v||'entrada').toLowerCase();if(t==='salida_final')return 'salida';return t}
function normDate(v){
  if(!v)return '';
  if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10);
  const p=String(v).split('/');
  if(p.length===3)return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  return String(v).slice(0,10);
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function callFunction(name, body){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Tu sesion vencio. Inicia sesion de nuevo.');
  const res=await fetch(`${SUPA_URL}/functions/v1/${name}`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':`Bearer ${session.access_token}`,
      'apikey':SUPA_KEY
    },
    body:JSON.stringify(body)
  });
  const text=await res.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null}catch{payload={error:text}}
  if(!res.ok)throw new Error(payload?.error||`Error ${res.status} en ${name}`);
  return payload;
}

async function loginAdmin(){
  const msg=document.getElementById('login-msg');
  msg.textContent='Iniciando sesión...';
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-pass').value;
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){msg.textContent=error.message;return}
  await enterConsole(data.user,msg);
}

async function enterConsole(user,msgEl=null,initialTab=null){
  state.user=user;
  const msg=msgEl||document.getElementById('login-msg');
  const {data:profile,error:profileError}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(profileError||!profile||!['admin','rrhh'].includes(String(profile.rol||'').toLowerCase())){
    await sb.auth.signOut();
    if(msg)msg.textContent='Este usuario no tiene permisos de consola.';
    return false;
  }
  state.profile=profile;
  document.getElementById('login').classList.add('hidden');
  document.getElementById('console').classList.remove('hidden');
  if(initialTab)showTab(initialTab);
  setDefaultDates();
  await cargarTiposPerfil();
  await refreshAll();
  if(msg)msg.textContent='';
  return true;
}

async function logout(){await sb.auth.signOut();location.reload()}

function setDefaultDates(){
  const today=todayISO();
  document.getElementById('fecha-desde').value=today;
  document.getElementById('fecha-hasta').value=today;
}

function showTab(id){
  sessionStorage.setItem('people360-tab',id);
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.id===id));
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  document.getElementById('page-title').textContent={dashboard:'Dashboard',empleados:'Empleados',asistencia:'Asistencia',ubicaciones:'Ubicaciones',capsulas:'Capsulas',seleccion:'Selección de Personal',solicitudes:'Solicitudes',notificaciones:'Notificaciones',reportes:'Reportes',encuestas:'Encuestas de Clima',configuracion:'Configuración de Empresa',perfiles:'Perfiles',linkedin:'Búsqueda LinkedIn'}[id]||id;
  if(id==='notificaciones')renderNotifTargets();
  if(id==='solicitudes')cargarSolicitudesGestion();
  if(id==='ubicaciones')cargarUbicaciones();
  if(id==='capsulas')cargarCapsulas();
  if(id==='seleccion')cargarSeleccion();
  if(id==='perfiles')renderPerfilEditor();
  if(id==='encuestas')cargarEncuestas();
  if(id==='configuracion')cargarConfigEmpresa();
  if(id==='linkedin')mostrarTabLinkedIn();
}

async function refreshAll(){
  const desde=document.getElementById('fecha-desde').value||todayISO();
  const hasta=document.getElementById('fecha-hasta').value||desde;
  const [empleadosRes,marcajesRes,vacacionesRes,ausenciasRes,solicitudesRes,ubicacionesRes,convocatoriasRes]=await Promise.all([
    sb.from('profiles').select('*').order('nombre_completo',{ascending:true}),
    sb.from('marcajes').select('*').gte('created_at',`${desde}T00:00:00`).lte('created_at',`${hasta}T23:59:59`).order('created_at',{ascending:true}),
    sb.from('vacaciones').select('*').gte('created_at',`${desde}T00:00:00`).lte('created_at',`${hasta}T23:59:59`).order('created_at',{ascending:false}),
    sb.from('ausencias').select('*').gte('created_at',`${desde}T00:00:00`).lte('created_at',`${hasta}T23:59:59`).order('created_at',{ascending:false}),
    sb.from('solicitudes_varias').select('*').gte('created_at',`${desde}T00:00:00`).lte('created_at',`${hasta}T23:59:59`).order('created_at',{ascending:false}),
    sb.from('ubicaciones').select('*').order('created_at',{ascending:false}),
    sb.from('seleccion_convocatorias').select('*').order('created_at',{ascending:false})
  ]);
  if(empleadosRes.error){toast(empleadosRes.error.message);return}
  if(marcajesRes.error){toast(marcajesRes.error.message);return}
  state.empleados=empleadosRes.data||[];
  state.marcajes=marcajesRes.data||[];
  state.vacaciones=vacacionesRes.data||[];
  state.ausencias=ausenciasRes.data||[];
  state.solicitudes=solicitudesRes.data||[];
  state.ubicaciones=ubicacionesRes.data||[];
  if(!convocatoriasRes.error)state.convocatorias=convocatoriasRes.data||[];
  buildAnalytics();
  buildSolicitudesReporte();
  renderAll();
}

function buildAnalytics(){
  const inicio=timeToMin(document.getElementById('hora-inicio').value||'08:00');
  const fin=timeToMin(document.getElementById('hora-fin').value||'17:00');
  const byUser=new Map();
  state.marcajes.forEach(m=>{
    if(!byUser.has(m.user_id))byUser.set(m.user_id,[]);
    byUser.get(m.user_id).push(m);
  });
  state.resumen=state.empleados.map(emp=>{
    const marks=(byUser.get(emp.id)||[]).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    const pick=(tipo)=>marks.find(m=>tipoMarcaje(m.tipo)===tipo)||null;
    const entrada=pick('entrada')||marks[0]||null;
    const salidaAlmuerzo=pick('salida_almuerzo');
    const regresoAlmuerzo=pick('regreso_almuerzo');
    const salida=pick('salida')||marks[marks.length-1]||null;
    const entradaMin=entrada?timeToMin(entrada.hora):null;
    const salidaAlmuerzoMin=salidaAlmuerzo?timeToMin(salidaAlmuerzo.hora):null;
    const regresoAlmuerzoMin=regresoAlmuerzo?timeToMin(regresoAlmuerzo.hora):null;
    const salidaMin=salida?timeToMin(salida.hora):null;
    const almuerzoMin=diffMin(salidaAlmuerzoMin,regresoAlmuerzoMin);
    const jornadaMin=entrada&&salida&&salida.id!==entrada.id?diffMin(entradaMin,salidaMin):null;
    const extraMin=salidaMin!==null?Math.max(0,salidaMin-fin):null;
    const enHorario=entradaMin!==null&&entradaMin>=inicio&&entradaMin<=fin;
    const completo=Boolean(entrada&&salidaAlmuerzo&&regresoAlmuerzo&&salida);
    return {
      id:emp.id,email:emp.email||'',nombre:emp.nombre_completo||emp.email||emp.id,departamento:emp.departamento||'',puesto:emp.puesto||'',
      marcajes:marks.length,primer_marcaje:entrada?entrada.hora:'',fecha:entrada?normDate(entrada.fecha||entrada.created_at):'',
      entrada:entrada?entrada.hora:'',salida_almuerzo:salidaAlmuerzo?salidaAlmuerzo.hora:'',regreso_almuerzo:regresoAlmuerzo?regresoAlmuerzo.hora:'',salida:salida?salida.hora:'',
      almuerzo_min:almuerzoMin,jornada_min:jornadaMin,extra_min:extraMin,completo,en_horario:enHorario
    };
  });
  state.sinUso=state.resumen.filter(r=>r.marcajes===0);
  state.fuera=state.resumen.filter(r=>r.marcajes>0&&(!r.en_horario||!r.completo||Number(r.extra_min||0)>0));
}

function empleadoById(id){
  return state.empleados.find(e=>e.id===id)||{};
}

function buildSolicitudesReporte(){
  const pack=(tipo,row,extra={})=>{
    const emp=empleadoById(row.user_id);
    return {
      categoria:tipo,
      empleado:emp.nombre_completo||emp.email||row.user_id,
      email:emp.email||'',
      departamento:emp.departamento||'',
      puesto:emp.puesto||'',
      tipo:row.tipo||row.motivo||tipo,
      detalles:row.detalles||'',
      fecha_inicio:row.fecha_inicio||'',
      fecha_fin:row.fecha_fin||'',
      dias:row.dias||'',
      estado:row.estado||'pendiente',
      creado:row.created_at||'',
      ...extra
    };
  };
  state.solicitudesReporte=[
    ...state.vacaciones.map(v=>pack('Vacaciones',v)),
    ...state.ausencias.map(a=>pack('Ausencia',a,{hora_inicio:a.hora_inicio||'',hora_fin:a.hora_fin||''})),
    ...state.solicitudes.map(s=>pack('Solicitud varias',s))
  ].sort((a,b)=>String(b.creado).localeCompare(String(a.creado)));
}

function renderAll(){
  renderDashboard();
  renderEmpleados();
  renderNotifTargets();
  renderUbicaciones();
  renderSeleccion();
  renderTables();
  applyConsolePermissions();
}

function renderDashboard(){
  const areaEl=document.getElementById('dash-area');
  if(areaEl){
    const areas=[...new Set(state.empleados.map(e=>e.departamento||'').filter(Boolean))].sort();
    const curVal=areaEl.value;
    areaEl.innerHTML='<option value="">Todas las áreas</option>'+areas.map(a=>`<option value="${escapeHtml(a)}"${a===curVal?' selected':''}>${escapeHtml(a)}</option>`).join('');
  }
  const area=areaEl?.value||'';
  const empleados=area?state.empleados.filter(e=>(e.departamento||'')===area):state.empleados;
  const empIds=new Set(empleados.map(e=>e.id));
  const resumen=area?state.resumen.filter(r=>(r.departamento||'')===area):state.resumen;
  const solicitudes=area?state.solicitudesReporte.filter(s=>(s.departamento||'')===area):state.solicitudesReporte;
  const vacaciones=area?state.vacaciones.filter(v=>empIds.has(v.user_id)):state.vacaciones;
  const ausencias=area?state.ausencias.filter(a=>empIds.has(a.user_id)):state.ausencias;
  const marcaron=resumen.filter(r=>r.marcajes>0).length;
  const correctos=resumen.filter(r=>r.en_horario).length;
  const sinUso=resumen.filter(r=>r.marcajes===0).length;
  const pendientes=solicitudes.filter(s=>String(s.estado||'pendiente')==='pendiente').length;
  const vacAprobadas=vacaciones.filter(v=>v.estado==='aprobada').length;
  const totalExtraMin=resumen.reduce((s,r)=>s+(Number(r.extra_min)||0),0);
  document.getElementById('m-empleados').textContent=empleados.length;
  document.getElementById('m-marcaron').textContent=marcaron;
  document.getElementById('m-correctos').textContent=correctos;
  document.getElementById('m-sinuso').textContent=sinUso;
  document.getElementById('m-solicitudes').textContent=pendientes;
  document.getElementById('m-ausencias').textContent=ausencias.length;
  document.getElementById('m-vacaciones').textContent=vacAprobadas;
  document.getElementById('m-extra').textContent=`${(totalExtraMin/60).toFixed(1)}h`;
  renderCharts(correctos,marcaron-correctos,sinUso,marcaron,resumen,solicitudes,vacaciones,ausencias);
}

function table(headers,rows){
  return `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>`;
}

function renderEmpleados(){
  const rows=state.empleados.map(e=>`<tr><td>${escapeHtml(e.nombre_completo)}</td><td>${escapeHtml(e.email)}</td><td>${escapeHtml(e.departamento)}</td><td>${escapeHtml(e.puesto)}</td><td>${escapeHtml(e.rol)}</td><td class="${e.biometria_marcaje_requerida?'ok':'bad'}">${e.biometria_marcaje_requerida?'Requerida':'No requerida'}</td><td>${escapeHtml(e.jefe_email||'')}</td><td>${escapeHtml(e.fecha_ingreso||'')}</td><td><button class="mini secondary" onclick="editarEmpleado('${e.id}')">Editar</button></td></tr>`);
  document.getElementById('tabla-empleados').innerHTML=table(['Nombre','Email','Area','Puesto','Rol','Biometria','Correo vacaciones','Ingreso','Accion'],rows);
}

async function cargarUbicaciones(){
  const {data,error}=await sb.from('ubicaciones').select('*').order('created_at',{ascending:false});
  if(error){toast(error.message);return}
  state.ubicaciones=data||[];
  renderUbicaciones();
}

function renderUbicaciones(){
  const tableEl=document.getElementById('tabla-ubicaciones');
  if(!tableEl)return;
  const rows=state.ubicaciones.map(u=>`<tr>
    <td>${escapeHtml(u.nombre)}</td>
    <td>${Number(u.lat||0).toFixed(6)}</td>
    <td>${Number(u.lng||0).toFixed(6)}</td>
    <td>${escapeHtml(u.radio_metros||'')}m</td>
    <td class="${u.activa?'ok':'bad'}">${u.activa?'Activa':'Inactiva'}</td>
    <td>${escapeHtml(String(u.created_at||'').slice(0,10))}</td>
    <td><div class="row-actions"><button class="mini secondary" onclick="toggleUbicacionConsola('${u.id}',${Boolean(u.activa)})">${u.activa?'Desactivar':'Activar'}</button><button class="mini secondary danger" onclick="eliminarUbicacionConsola('${u.id}')">Eliminar</button></div></td>
  </tr>`);
  tableEl.innerHTML=table(['Nombre','Latitud','Longitud','Radio','Estado','Creada','Accion'],rows);
}

function limpiarUbicacionForm(){
  ['ubi-nombre','ubi-lat','ubi-lng'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ubi-radio').value='50';
}

function usarUbicacionActualConsola(){
  const status=document.getElementById('ubi-status');
  if(status)status.textContent='Obteniendo ubicacion actual...';
  if(!navigator.geolocation){
    toast('GPS no disponible en este navegador');
    if(status)status.textContent='GPS no disponible en este navegador.';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const lat=pos.coords.latitude;
      const lng=pos.coords.longitude;
      const acc=Math.round(pos.coords.accuracy||0);
      document.getElementById('ubi-lat').value=lat.toFixed(7);
      document.getElementById('ubi-lng').value=lng.toFixed(7);
      if(status)status.textContent=`Ubicacion capturada: ${lat.toFixed(6)}, ${lng.toFixed(6)} | precision +/-${acc}m`;
      toast('Ubicacion actual cargada');
    },
    err=>{
      toast('No se pudo obtener ubicacion: '+err.message);
      if(status)status.textContent='No se pudo obtener ubicacion. Revisa permisos del navegador.';
    },
    {enableHighAccuracy:true,timeout:15000,maximumAge:0}
  );
}

async function guardarUbicacion(){
  const nombre=document.getElementById('ubi-nombre').value.trim();
  const lat=parseFloat(document.getElementById('ubi-lat').value);
  const lng=parseFloat(document.getElementById('ubi-lng').value);
  const radio=parseInt(document.getElementById('ubi-radio').value,10)||50;
  if(!nombre){toast('Ingresa un nombre');return}
  if(Number.isNaN(lat)||Number.isNaN(lng)){toast('Ingresa latitud y longitud validas');return}
  const {error}=await sb.from('ubicaciones').insert({nombre,lat,lng,radio_metros:radio,created_by:state.user.id,activa:true});
  if(error){toast(error.message);return}
  toast('Ubicacion agregada');
  limpiarUbicacionForm();
  await cargarUbicaciones();
}

async function toggleUbicacionConsola(id,activa){
  const {error}=await sb.from('ubicaciones').update({activa:!activa}).eq('id',id);
  if(error){toast(error.message);return}
  toast(activa?'Ubicacion desactivada':'Ubicacion activada');
  await cargarUbicaciones();
}

async function eliminarUbicacionConsola(id){
  if(!confirm('Eliminar esta ubicacion?'))return;
  const {error}=await sb.from('ubicaciones').delete().eq('id',id);
  if(error){
    const msg=String(error.message||'');
    if(msg.includes('foreign key')||msg.includes('marcajes_ubicacion')){
      const {error:updError}=await sb.from('ubicaciones').update({activa:false}).eq('id',id);
      if(updError){toast(updError.message);return}
      toast('Tiene marcajes historicos. Se desactivo para conservar historial.');
      await cargarUbicaciones();
      return;
    }
    toast(error.message);
    return;
  }
  toast('Ubicacion eliminada');
  await cargarUbicaciones();
}

function youtubeIdFromUrl(url){
  const raw=String(url||'').trim();
  if(!raw)return '';
  const direct=raw.match(/^[a-zA-Z0-9_-]{11}$/);
  if(direct)return raw;
  const patterns=[
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?[^#]*v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  for(const p of patterns){
    const m=raw.match(p);
    if(m)return m[1];
  }
  return '';
}

async function cargarCapsulas(){
  const {data,error}=await sb.from('capsulas_informativas').select('*').order('created_at',{ascending:false});
  if(error){toast(error.message);return}
  state.capsulas=data||[];
  renderCapsulasAdmin();
}

function renderCapsulasAdmin(){
  const tableEl=document.getElementById('tabla-capsulas');
  if(!tableEl)return;
  const rows=state.capsulas.map(c=>`<tr>
    <td>${escapeHtml(c.titulo)}</td>
    <td>${escapeHtml(c.categoria||'')}</td>
    <td>${escapeHtml(c.departamento||'Todos')}</td>
    <td class="${c.activa?'ok':'bad'}">${c.activa?'Activa':'Inactiva'}</td>
    <td><a href="${escapeHtml(c.youtube_url)}" target="_blank" rel="noopener">Ver</a></td>
    <td>${escapeHtml(String(c.created_at||'').slice(0,10))}</td>
    <td><div class="row-actions"><button class="mini secondary" onclick="editarCapsula('${c.id}')">Editar</button><button class="mini secondary" onclick="toggleCapsula('${c.id}',${Boolean(c.activa)})">${c.activa?'Desactivar':'Activar'}</button><button class="mini secondary danger" onclick="eliminarCapsula('${c.id}')">Eliminar</button></div></td>
  </tr>`);
  tableEl.innerHTML=table(['Titulo','Categoria','Area','Estado','Video','Creada','Accion'],rows);
}

function limpiarCapsula(){
  ['cap-id','cap-titulo','cap-descripcion','cap-youtube','cap-categoria','cap-departamento'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('cap-activa').checked=true;
}

function editarCapsula(id){
  const c=state.capsulas.find(x=>String(x.id)===String(id));
  if(!c)return;
  document.getElementById('cap-id').value=c.id;
  document.getElementById('cap-titulo').value=c.titulo||'';
  document.getElementById('cap-descripcion').value=c.descripcion||'';
  document.getElementById('cap-youtube').value=c.youtube_url||'';
  document.getElementById('cap-categoria').value=c.categoria||'';
  document.getElementById('cap-departamento').value=c.departamento||'';
  document.getElementById('cap-activa').checked=Boolean(c.activa);
  window.scrollTo({top:0,behavior:'smooth'});
}

async function guardarCapsula(){
  const id=document.getElementById('cap-id').value||null;
  const youtubeUrl=document.getElementById('cap-youtube').value.trim();
  const row={
    titulo:document.getElementById('cap-titulo').value.trim(),
    descripcion:document.getElementById('cap-descripcion').value.trim(),
    youtube_url:youtubeUrl,
    youtube_id:youtubeIdFromUrl(youtubeUrl),
    categoria:document.getElementById('cap-categoria').value.trim()||'RRHH',
    departamento:document.getElementById('cap-departamento').value.trim(),
    activa:document.getElementById('cap-activa').checked,
    updated_at:new Date().toISOString()
  };
  if(!row.titulo){toast('Ingresa el titulo');return}
  if(!row.youtube_url||!row.youtube_id){toast('Ingresa un link valido de YouTube');return}
  const {error}=id
    ? await sb.from('capsulas_informativas').update(row).eq('id',id)
    : await sb.from('capsulas_informativas').insert({...row,created_by:state.user.id});
  if(error){toast(error.message);return}
  if(!id&&row.activa){
    callFunction('notificaciones-manage',{
      action:'broadcast',
      titulo:'Nueva capsula informativa',
      mensaje:`RRHH publico una nueva capsula: ${row.titulo}. Puedes verla desde el modulo Capsulas informativas.`,
      scope:row.departamento?'departamento':'todos',
      departamento:row.departamento||''
    }).catch(e=>console.warn('No se pudo notificar la capsula:', e.message));
  }
  toast(id?'Capsula actualizada':'Capsula publicada');
  limpiarCapsula();
  await cargarCapsulas();
}

async function toggleCapsula(id,activa){
  const {error}=await sb.from('capsulas_informativas').update({activa:!activa,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){toast(error.message);return}
  toast(activa?'Capsula desactivada':'Capsula activada');
  await cargarCapsulas();
}

async function eliminarCapsula(id){
  if(!confirm('Eliminar esta capsula?'))return;
  const {error}=await sb.from('capsulas_informativas').delete().eq('id',id);
  if(error){toast(error.message);return}
  toast('Capsula eliminada');
  await cargarCapsulas();
}

// Seleccion de personal
const SELECCION_WEBHOOK='http://localhost:5678/webhook/people360-seleccion';

function selectedConvocatoria(){
  return state.convocatorias.find(c=>String(c.id)===String(state.convocatoriaActual))||null;
}

function seleccionWebhook(){
  return SELECCION_WEBHOOK;
}

async function cargarSeleccion(){
  const [convRes,candRes]=await Promise.all([
    sb.from('seleccion_convocatorias').select('*').order('created_at',{ascending:false}),
    sb.from('seleccion_candidatos').select('*').order('created_at',{ascending:false})
  ]);
  if(convRes.error){toast(convRes.error.message);return}
  if(candRes.error){toast(candRes.error.message);return}
  state.convocatorias=convRes.data||[];
  state.candidatos=candRes.data||[];
  if(state.convocatoriaActual&&!state.convocatorias.some(c=>String(c.id)===String(state.convocatoriaActual))){
    state.convocatoriaActual=null;
  }
  renderSeleccion();
}

function renderSeleccion(){
  const convTable=document.getElementById('tabla-seleccion-convocatorias');
  const candTable=document.getElementById('tabla-seleccion-candidatos');
  if(!convTable||!candTable)return;

  const filtro=document.getElementById('sel-estado-filtro')?.value||'';
  const convocatorias=state.convocatorias.filter(c=>!filtro||c.estado===filtro);
  const convRows=convocatorias.map(c=>{
    const total=state.candidatos.filter(x=>x.convocatoria_id===c.id).length;
    const isActive=String(state.convocatoriaActual)===String(c.id);
    const dias=diasProceso(c);
    const diasLabel=c.fecha_contratacion?`<span class="ok">${dias}d</span>`:`${dias}d`;
    const yaContratado=!!c.contratado_nombre;
    const estadoDisplay=yaContratado?'contratado':c.estado;
    const acciones=[];
    if(!yaContratado&&c.estado!=='cerrada'){
      acciones.push(`<button class="mini sel-btn-contratar" onclick="abrirModalContratar('${c.id}')">Contratar</button>`);
      acciones.push(`<button class="mini secondary" onclick="cerrarPlaza('${c.id}')">Cerrar</button>`);
    }
    if(['cerrada','completada','analizando'].includes(c.estado)&&!yaContratado){
      acciones.push(`<button class="mini secondary" onclick="reabrirPlaza('${c.id}')">Reabrir</button>`);
    }
    const fechaCreada=c.created_at?new Date(c.created_at).toLocaleDateString('es-GT'):'-';
    return `<tr class="${isActive?'row-selected':''}">
      <td>${isActive
        ? `<button class="mini sel-btn-active" onclick="deseleccionarConvocatoria()" title="Clic para deseleccionar">✓ Activa ✕</button>`
        : `<button class="mini secondary" onclick="seleccionarConvocatoria('${c.id}')">Seleccionar</button>`
      }</td>
      <td><strong>${escapeHtml(c.titulo||'—')}</strong></td>
      <td>${escapeHtml(c.puesto||'—')}</td>
      <td>${estadoBadge(estadoDisplay||'abierta')}</td>
      <td>${total}</td>
      <td>${escapeHtml(c.recomendado_nombre||'-')}</td>
      <td>${yaContratado?`<strong class="ok">${escapeHtml(c.contratado_nombre)}</strong>`:'-'}</td>
      <td>${diasLabel}</td>
      <td>${fechaCreada}</td>
      <td><div class="row-actions">${acciones.join('')}</div></td>
    </tr>`;
  });
  convTable.innerHTML=table(['','Plaza','Puesto','Estado','CVs','Recomendado IA','Contratado','Días','Creada','Acciones'],convRows);

  const actual=selectedConvocatoria();
  const current=document.getElementById('sel-current');
  if(current){
    if(actual&&actual.estado==='analizando'){
      const total=state.candidatos.filter(c=>c.convocatoria_id===actual.id).length;
      const analizados=state.candidatos.filter(c=>c.convocatoria_id===actual.id&&c.estado==='analizado').length;
      current.innerHTML=`<span class="sel-active-badge sel-badge-analizando"><span class="spinner">&#8635;</span> <span id="sel-analisis-progreso">Analizando CVs... ${analizados} de ${total} completados</span></span>`;
    } else if(actual){
      current.innerHTML=`<span class="sel-active-badge">Subiendo CVs a: <strong>${escapeHtml(actual.titulo)}</strong>${actual.puesto?` &mdash; ${escapeHtml(actual.puesto)}`:''}</span>`;
    } else {
      current.innerHTML='Selecciona una plaza en la tabla para activar esta sección.';
    }
  }
  const btnGuardar=document.getElementById('sel-btn-guardar');
  if(btnGuardar)btnGuardar.textContent=actual?'Actualizar plaza':'Crear plaza';

  const uploadSection=document.getElementById('sel-upload-section');
  const noSelection=document.getElementById('sel-no-selection');
  if(uploadSection)uploadSection.classList.toggle('hidden',!actual);
  if(noSelection)noSelection.classList.toggle('hidden',!!actual);

  const candidatos=actual?state.candidatos.filter(c=>c.convocatoria_id===actual.id):[];
  const convAnalizando=actual&&actual.estado==='analizando';
  const candRows=candidatos.map(c=>{
    const score=c.puntaje_total!==null&&c.puntaje_total!==undefined?`${c.puntaje_total}/100`:'-';
    const cumple=c.cumple_requisitos===true?'Si':c.cumple_requisitos===false?'No':'-';
    const estadoClass=c.estado==='analizado'?'ok':c.estado==='pendiente'?'':'bad';
    const estadoLabel=c.estado==='pendiente'&&convAnalizando
      ?`<span class="estado-analizando"><span class="spinner">&#8635;</span> Analizando...</span>`
      :escapeHtml(c.estado||'pendiente');
    const recClass=c.recomendado?'ok':'';
    return `<tr>
      <td><strong>${escapeHtml(c.nombre_candidato||c.nombre_archivo||'Candidato')}</strong><br><small style="color:var(--muted);font-weight:400">${escapeHtml(c.nombre_archivo||'')}</small></td>
      <td class="${estadoClass}">${estadoLabel}</td>
      <td><strong>${score}</strong></td>
      <td>${cumple}</td>
      <td class="${recClass}">${c.recomendado?'✓ Sí':'No'}</td>
      <td><div class="row-actions">
        ${c.estado==='analizado'?`<button class="mini" onclick="verCandidato('${c.id}')">Ver análisis</button>`:''}
        <button class="mini secondary danger" onclick="eliminarCandidato('${c.id}')">Eliminar</button>
      </div></td>
    </tr>`;
  });
  candTable.innerHTML=table(['Candidato','Estado','Puntaje','Cumple','Recomendado','Acciones'],candRows);
}

function deseleccionarConvocatoria(){
  state.convocatoriaActual=null;
  ['sel-titulo','sel-puesto','sel-requisitos'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderSeleccion();
}
function seleccionarConvocatoria(id){
  state.convocatoriaActual=id;
  const c=selectedConvocatoria();
  if(c){
    document.getElementById('sel-titulo').value=c.titulo||'';
    document.getElementById('sel-puesto').value=c.puesto||'';
    document.getElementById('sel-requisitos').value=c.requisitos||'';
    // Pre-llenar búsqueda LinkedIn con el puesto
  }
  renderSeleccion();
}

async function crearConvocatoria(){
  const titulo=document.getElementById('sel-titulo').value.trim();
  const puesto=document.getElementById('sel-puesto').value.trim();
  const requisitos=document.getElementById('sel-requisitos').value.trim();
  if(!titulo){toast('Ingresa el nombre de la convocatoria');return}
  if(!requisitos){toast('Ingresa los requisitos del puesto');return}
  if(state.convocatoriaActual){
    const {error}=await sb.from('seleccion_convocatorias').update({titulo,puesto,requisitos,updated_at:new Date().toISOString()}).eq('id',state.convocatoriaActual);
    if(error){toast(error.message);return}
    toast('Plaza actualizada');
  } else {
    const row={titulo,puesto,requisitos,estado:'abierta',created_by:state.user.id,updated_at:new Date().toISOString()};
    const {data,error}=await sb.from('seleccion_convocatorias').insert(row).select('*').single();
    if(error){toast(error.message);return}
    state.convocatoriaActual=data.id;
    toast('Plaza creada');
  }
  await cargarSeleccion();
}

function limpiarFormSeleccion(){
  ['sel-titulo','sel-puesto','sel-requisitos'].forEach(id=>document.getElementById(id).value='');
  state.convocatoriaActual=null;
  renderSeleccion();
}

function diasProceso(c){
  const inicio=c.created_at?new Date(c.created_at):null;
  if(!inicio||isNaN(inicio))return 0;
  const fin=c.fecha_contratacion?new Date(c.fecha_contratacion):new Date();
  return Math.max(0,Math.floor((fin-inicio)/(1000*60*60*24)));
}

function estadoBadge(estado){
  const map={
    abierta:{cls:'badge-blue',label:'Abierta'},
    analizando:{cls:'badge-orange',label:'Analizando'},
    completada:{cls:'badge-green',label:'Completada'},
    contratado:{cls:'badge-teal',label:'Contratado ✓'},
    cerrada:{cls:'badge-gray',label:'Cerrada'},
    error:{cls:'badge-red',label:'Error'}
  };
  const e=map[estado]||{cls:'badge-gray',label:escapeHtml(estado)};
  return `<span class="status-badge ${e.cls}">${e.label}</span>`;
}

function abrirModalContratar(convocatoriaId){
  const candidatos=state.candidatos.filter(c=>c.convocatoria_id===convocatoriaId);
  document.getElementById('modal-conv-id').value=convocatoriaId;
  const select=document.getElementById('modal-candidato-select');
  select.innerHTML=candidatos.map(c=>`<option value="${c.id}">${escapeHtml(c.nombre_candidato||c.nombre_archivo||'Candidato')}</option>`).join('');
  select.innerHTML+=`<option value="">— Candidato externo / no registrado —</option>`;
  const showExternal=!candidatos.length||select.value==='';
  document.getElementById('modal-nombre-externo-wrap').classList.toggle('hidden',!showExternal);
  document.getElementById('modal-nombre-externo').value='';
  document.getElementById('modal-fecha-contratacion').value=new Date().toISOString().slice(0,10);
  document.getElementById('modal-contratar').classList.remove('hidden');
}

function cerrarModalContratar(){
  document.getElementById('modal-contratar').classList.add('hidden');
}

function onModalCandidatoChange(){
  const val=document.getElementById('modal-candidato-select').value;
  document.getElementById('modal-nombre-externo-wrap').classList.toggle('hidden',!!val);
}

async function confirmarContratacion(){
  const convId=document.getElementById('modal-conv-id').value;
  const candidatoId=document.getElementById('modal-candidato-select').value||null;
  const fecha=document.getElementById('modal-fecha-contratacion').value;
  if(!fecha){toast('Selecciona la fecha de contratación');return}
  let nombre='';
  if(candidatoId){
    const c=state.candidatos.find(x=>x.id===candidatoId);
    nombre=c?(c.nombre_candidato||c.nombre_archivo||''):'';
  } else {
    nombre=document.getElementById('modal-nombre-externo').value.trim();
    if(!nombre){toast('Ingresa el nombre del candidato contratado');return}
  }
  const {error}=await sb.from('seleccion_convocatorias').update({
    estado:'cerrada',
    contratado_candidato_id:candidatoId,
    contratado_nombre:nombre,
    fecha_contratacion:new Date(fecha).toISOString(),
    updated_at:new Date().toISOString()
  }).eq('id',convId);
  if(error){toast(error.message);return}
  toast(`Contratación registrada: ${nombre}`);
  cerrarModalContratar();
  await cargarSeleccion();
}

function verCandidato(id){
  const c=state.candidatos.find(x=>x.id===id);
  if(!c)return;
  document.getElementById('modal-cand-nombre').textContent=c.nombre_candidato||c.nombre_archivo||'Candidato';
  const scoreBadge=document.getElementById('modal-cand-score');
  scoreBadge.textContent=`${c.puntaje_total??'-'}/100`;
  scoreBadge.className='cand-score-badge cand-score-'+(c.puntaje_total>=70?'alto':c.puntaje_total>=40?'medio':'bajo');
  document.getElementById('modal-cand-rec').className='status-badge '+(c.recomendado?'badge-green':'badge-gray');
  document.getElementById('modal-cand-rec').textContent=c.recomendado?'✓ Recomendado':'No recomendado';
  document.getElementById('modal-cand-cumple').className='status-badge '+(c.cumple_requisitos?'badge-green':'badge-red');
  document.getElementById('modal-cand-cumple').textContent=c.cumple_requisitos?'Cumple requisitos':'No cumple requisitos';
  document.getElementById('modal-cand-resumen').textContent=c.resumen||'Sin información';
  document.getElementById('modal-cand-fortalezas').textContent=c.fortalezas||'Sin información';
  document.getElementById('modal-cand-brechas').textContent=c.brechas||'Sin información';
  document.getElementById('modal-cand-riesgos').textContent=c.riesgos||'Sin información';
  const criterios=(c.analisis_json?.criterios)||[];
  const criteriosWrap=document.getElementById('modal-cand-criterios-wrap');
  const criteriosEl=document.getElementById('modal-cand-criterios');
  if(criterios.length){
    criteriosEl.innerHTML=criterios.map(cr=>`<div class="criterio-row ${cr.cumple?'criterio-ok':'criterio-bad'}">
      <div class="criterio-top"><span class="criterio-label">${cr.cumple?'✓':'✗'} ${escapeHtml(cr.criterio)}</span><span class="criterio-puntaje">${cr.puntaje??0} pts</span></div>
      <p class="criterio-evidencia">${escapeHtml(cr.evidencia||'')}</p>
    </div>`).join('');
    criteriosWrap.classList.remove('hidden');
  } else {
    criteriosWrap.classList.add('hidden');
  }
  document.getElementById('modal-candidato').classList.remove('hidden');
}

function cerrarModalCandidato(){
  document.getElementById('modal-candidato').classList.add('hidden');
}

async function eliminarCandidato(candidatoId){
  const c=state.candidatos.find(x=>x.id===candidatoId);
  if(!c)return;
  if(!confirm(`¿Eliminar el CV de "${c.nombre_candidato||c.nombre_archivo}"? Esta acción no se puede deshacer.`))return;
  if(c.storage_bucket&&c.storage_path){
    const {error:storageErr}=await sb.storage.from(c.storage_bucket).remove([c.storage_path]);
    if(storageErr)console.warn('No se pudo eliminar el archivo del storage:',storageErr.message);
  }
  const {error}=await sb.from('seleccion_candidatos').delete().eq('id',candidatoId);
  if(error){toast(error.message);return}
  toast('CV eliminado');
  await cargarSeleccion();
}

async function cerrarPlaza(convId){
  if(!confirm('¿Cerrar esta plaza sin registrar contratación?'))return;
  const {error}=await sb.from('seleccion_convocatorias').update({estado:'cerrada',updated_at:new Date().toISOString()}).eq('id',convId);
  if(error){toast(error.message);return}
  toast('Plaza cerrada');
  await cargarSeleccion();
}

async function reabrirPlaza(convId){
  const {error}=await sb.from('seleccion_convocatorias').update({estado:'abierta',updated_at:new Date().toISOString()}).eq('id',convId);
  if(error){toast(error.message);return}
  toast('Plaza reabierta');
  await cargarSeleccion();
}

async function subirCandidatosSeleccion(){
  const actual=selectedConvocatoria();
  if(!actual){toast('Selecciona una convocatoria');return}
  const files=[...document.getElementById('sel-files').files];
  if(!files.length){toast('Selecciona CVs en PDF o Word');return}
  const allowed=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const rows=[];
  for(const file of files){
    if(!allowed.includes(file.type)&&!/\.(pdf|doc|docx)$/i.test(file.name)){
      toast(`Archivo no permitido: ${file.name}`);
      continue;
    }
    const safeName=file.name.replace(/[^\w.\-]+/g,'_');
    const path=`${actual.id}/${Date.now()}-${safeName}`;
    const up=await sb.storage.from('seleccion-cv').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(up.error){toast(up.error.message);continue}
    rows.push({
      convocatoria_id:actual.id,
      nombre_archivo:file.name,
      storage_bucket:'seleccion-cv',
      storage_path:path,
      mime_type:file.type||'application/octet-stream',
      estado:'pendiente',
      created_by:state.user.id
    });
  }
  if(!rows.length)return;
  const {error}=await sb.from('seleccion_candidatos').insert(rows);
  if(error){toast(error.message);return}
  document.getElementById('sel-files').value='';
  toast(`${rows.length} CV(s) cargado(s)`);
  await cargarSeleccion();
}

let _seleccionPollTimer=null;
function iniciarPollingSeleccion(convocatoriaId,totalCandidatos){
  if(_seleccionPollTimer)clearInterval(_seleccionPollTimer);
  let intentos=0;
  _seleccionPollTimer=setInterval(async()=>{
    intentos++;
    const {data:cands}=await sb.from('seleccion_candidatos').select('estado').eq('convocatoria_id',convocatoriaId);
    const analizados=(cands||[]).filter(c=>c.estado==='analizado').length;
    // Actualizar conteo visual en tiempo real
    const progEl=document.getElementById('sel-analisis-progreso');
    if(progEl)progEl.textContent=`Analizando CVs... ${analizados} de ${totalCandidatos} completados`;
    if(totalCandidatos>0&&analizados>=totalCandidatos){
      clearInterval(_seleccionPollTimer);_seleccionPollTimer=null;
      // El frontend cierra la convocatoria (n8n ya no lo hace)
      await sb.from('seleccion_convocatorias').update({estado:'completada',updated_at:new Date().toISOString()}).eq('id',convocatoriaId);
      await cargarSeleccion();
      toast('Análisis completado');
    } else if(intentos>=72){
      clearInterval(_seleccionPollTimer);_seleccionPollTimer=null;
      await cargarSeleccion();
    }
  },5000);
}

async function analizarConvocatoriaSeleccion(){
  const actual=selectedConvocatoria();
  if(!actual){toast('Selecciona una convocatoria');return}
  const webhook=seleccionWebhook();
  const candidatos=state.candidatos.filter(c=>c.convocatoria_id===actual.id);
  if(!candidatos.length){toast('Carga al menos un CV');return}
  await sb.from('seleccion_convocatorias').update({estado:'analizando',updated_at:new Date().toISOString()}).eq('id',actual.id);
  // Enviar 1 webhook por candidato — cada uno corre como ejecucion independiente en n8n
  let enviados=0;
  for(const cand of candidatos){
    try{
      const res=await fetch(webhook,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          source:'people360',
          supabase_url:SUPA_URL,
          convocatoria_id:actual.id,
          titulo:actual.titulo,
          puesto:actual.puesto,
          requisitos:actual.requisitos,
          candidatos:[{id:cand.id,nombre_archivo:cand.nombre_archivo,bucket:cand.storage_bucket,path:cand.storage_path,mime_type:cand.mime_type}]
        })
      });
      if(res.ok)enviados++;
    }catch(e){console.warn('Error enviando candidato a n8n:',e.message)}
  }
  if(!enviados){
    await sb.from('seleccion_convocatorias').update({estado:'abierta',updated_at:new Date().toISOString()}).eq('id',actual.id);
    toast('No se pudo conectar con n8n');
    await cargarSeleccion();
    return;
  }
  toast(`Analizando ${enviados} CV(s) — actualizando cada 5 seg...`);
  iniciarPollingSeleccion(actual.id,candidatos.length);
  await cargarSeleccion();
}

function nuevoEmpleado(){
  ['emp-id','emp-nombre','emp-email','emp-password','emp-empresa','emp-departamento','emp-puesto','emp-telefono','emp-fecha-ingreso','emp-jefe-nombre','emp-jefe-email','emp-biometria-motivo'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('emp-rol').value='empleado';
  document.getElementById('emp-vacaciones').value='15';
  document.getElementById('emp-biometria').checked=true;
  document.getElementById('emp-email').disabled=false;
}

function editarEmpleado(id){
  const e=state.empleados.find(x=>x.id===id);
  if(!e)return;
  document.getElementById('emp-id').value=e.id||'';
  document.getElementById('emp-nombre').value=e.nombre_completo||'';
  document.getElementById('emp-email').value=e.email||'';
  document.getElementById('emp-password').value='';
  document.getElementById('emp-rol').value=e.rol||'empleado';
  document.getElementById('emp-empresa').value=e.empresa||'';
  document.getElementById('emp-departamento').value=e.departamento||'';
  document.getElementById('emp-puesto').value=e.puesto||'';
  document.getElementById('emp-telefono').value=e.telefono||'';
  document.getElementById('emp-fecha-ingreso').value=e.fecha_ingreso||'';
  document.getElementById('emp-vacaciones').value=e.dias_vacaciones_total||15;
  document.getElementById('emp-jefe-nombre').value=e.jefe_nombre||'';
  document.getElementById('emp-jefe-email').value=e.jefe_email||'';
  document.getElementById('emp-biometria').checked=Boolean(e.biometria_marcaje_requerida);
  document.getElementById('emp-biometria-motivo').value=e.biometria_marcaje_excepcion_motivo||'';
  showTab('empleados');
  window.scrollTo({top:0,behavior:'smooth'});
}

function empleadoFormData(){
  const rol=document.getElementById('emp-rol').value;
  return {
    id:document.getElementById('emp-id').value||null,
    nombre_completo:document.getElementById('emp-nombre').value.trim(),
    email:document.getElementById('emp-email').value.trim(),
    password:document.getElementById('emp-password').value,
    rol,
    permisos:DEFAULT_PERMISOS[rol]||DEFAULT_PERMISOS.empleado,
    empresa:document.getElementById('emp-empresa').value.trim(),
    departamento:document.getElementById('emp-departamento').value.trim(),
    puesto:document.getElementById('emp-puesto').value.trim(),
    telefono:document.getElementById('emp-telefono').value.trim(),
    fecha_ingreso:document.getElementById('emp-fecha-ingreso').value||null,
    dias_vacaciones_total:Number(document.getElementById('emp-vacaciones').value||15),
    jefe_nombre:document.getElementById('emp-jefe-nombre').value.trim(),
    jefe_email:document.getElementById('emp-jefe-email').value.trim(),
    biometria_marcaje_requerida:document.getElementById('emp-biometria').checked,
    biometria_marcaje_excepcion_motivo:document.getElementById('emp-biometria-motivo').value.trim()
  };
}

async function guardarEmpleado(){
  const empleado=empleadoFormData();
  if(!empleado.email){toast('Ingresa el correo de acceso');return}
  if(!empleado.nombre_completo){toast('Ingresa el nombre completo');return}
  try{
    const data=await callFunction('admin-empleado-save',{empleado});
    if(data&&data.error){toast(data.error);return}
    if(data&&data.user_id){
      const bioRes=await sb.from('profiles').update({
        biometria_marcaje_requerida:empleado.biometria_marcaje_requerida,
        biometria_marcaje_excepcion_motivo:empleado.biometria_marcaje_requerida?'':empleado.biometria_marcaje_excepcion_motivo
      }).eq('id',data.user_id);
      if(bioRes.error){toast('Usuario guardado, pero no se pudo actualizar biometria: '+bioRes.error.message);return}
    }
    toast('Usuario guardado');
    nuevoEmpleado();
    await refreshAll();
  }catch(error){
    toast(error.message);
  }
}

function renderTables(){
  const detalle=r=>`<tr><td>${escapeHtml(r.nombre)}</td><td>${escapeHtml(r.departamento)}</td><td>${escapeHtml(r.entrada)}</td><td>${escapeHtml(r.salida_almuerzo)}</td><td>${escapeHtml(r.regreso_almuerzo)}</td><td>${escapeHtml(r.salida)}</td><td>${r.almuerzo_min??''}</td><td>${r.jornada_min?minToTime(r.jornada_min):''}</td><td>${r.extra_min||0}</td><td class="${r.completo&&r.en_horario?'ok':'bad'}">${r.completo?'Completo':'Incompleto'}</td></tr>`;
  const row=r=>`<tr><td>${escapeHtml(r.nombre)}</td><td>${escapeHtml(r.departamento)}</td><td>${escapeHtml(r.puesto)}</td><td>${escapeHtml(r.fecha)}</td><td>${escapeHtml(r.primer_marcaje)}</td><td>${escapeHtml(r.salida)}</td><td class="${r.en_horario&&r.completo&&!r.extra_min?'ok':'bad'}">${r.en_horario&&r.completo&&!r.extra_min?'Correcto':'Revisar'}</td></tr>`;
  document.getElementById('tabla-detalle-marcajes').innerHTML=table(['Empleado','Area','Entrada','Sale almuerzo','Regresa almuerzo','Salida','Almuerzo min','Jornada','Extra min','Estado'],state.resumen.map(detalle));
  document.getElementById('tabla-fuera').innerHTML=table(['Empleado','Departamento','Puesto','Fecha','Entrada','Salida','Estado'],state.fuera.map(row));
  document.getElementById('tabla-sinuso').innerHTML=table(['Empleado','Departamento','Puesto','Fecha','Primer marcaje','Estado'],state.sinUso.map(row));
  const solicitud=s=>`<tr><td>${escapeHtml(s.categoria)}</td><td>${escapeHtml(s.empleado)}</td><td>${escapeHtml(s.departamento)}</td><td>${escapeHtml(s.tipo)}</td><td>${escapeHtml(s.detalles)}</td><td>${escapeHtml(s.fecha_inicio)}</td><td>${escapeHtml(s.fecha_fin)}</td><td class="${s.estado==='pendiente'?'bad':'ok'}">${escapeHtml(s.estado)}</td><td>${escapeHtml(String(s.creado).slice(0,10))}</td></tr>`;
  document.getElementById('tabla-solicitudes').innerHTML=table(['Categoria','Empleado','Area','Tipo','Detalles','Inicio','Fin','Estado','Creado'],state.solicitudesReporte.map(solicitud));
}

function renderCharts(correctos,fuera,sinUso,conUso,resumen,solicitudes,vacaciones,ausencias){
  const dlD={
    display:ctx=>ctx.dataset.data[ctx.dataIndex]>0,
    formatter:(v,ctx)=>{const t=ctx.dataset.data.reduce((a,b)=>a+b,0);return t?Math.round(v/t*100)+'%':''},
    color:'#fff',font:{weight:800,size:12}
  };
  const dlB={display:ctx=>ctx.dataset.data[ctx.dataIndex]>0,anchor:'end',align:'end',offset:2,formatter:v=>v,color:'#657481',font:{weight:800,size:11}};
  chart('chart-puntualidad','doughnut',['En horario','Fuera'],[correctos,fuera],['#18b978','#ee3f45'],dlD);
  const pend=solicitudes.filter(s=>s.estado==='pendiente').length;
  const apr=solicitudes.filter(s=>s.estado==='aprobada').length;
  const otras=Math.max(0,solicitudes.length-pend-apr);
  chart('chart-solicitudes','doughnut',['Pendientes','Aprobadas','Otras'],[pend,apr,otras],['#ee3f45','#18b978','#20c5dc'],dlD);
  chart('chart-ausencias','doughnut',['Vacaciones','Ausencias','Solicitudes'],[vacaciones.length,ausencias.length,solicitudes.filter(s=>s.categoria==='Solicitud varias').length],['#20c5dc','#ee3f45','#f5a623'],dlD);
  chart('chart-uso','bar',['Usan app','Sin uso'],[conUso,sinUso],['#20c5dc','#101820'],dlB);
  const areaMap=new Map();
  state.empleados.forEach(e=>{const d=e.departamento||'Sin área';areaMap.set(d,(areaMap.get(d)||0)+1);});
  const areasSorted=[...areaMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  const COLORS=['#20c5dc','#18b978','#ee3f45','#f5a623','#9b59b6','#3498db','#e74c3c','#2ecc71'];
  chartH('chart-areas',areasSorted.map(a=>a[0]),areasSorted.map(a=>a[1]),areasSorted.map((_,i)=>COLORS[i%8]),
    {display:ctx=>ctx.dataset.data[ctx.dataIndex]>0,anchor:'end',align:'right',offset:4,formatter:v=>v,color:'#657481',font:{weight:800,size:11}});
  const deptMap=new Map();
  state.resumen.forEach(r=>{const d=r.departamento||'Sin área';if(!deptMap.has(d))deptMap.set(d,{enH:0,fuera:0});if(r.en_horario)deptMap.get(d).enH++;else deptMap.get(d).fuera++;});
  const topDepts=[...deptMap.entries()].sort((a,b)=>(b[1].enH+b[1].fuera)-(a[1].enH+a[1].fuera)).slice(0,6);
  chartMulti('chart-puntuarea','bar',topDepts.map(d=>d[0]),[
    {label:'En horario',data:topDepts.map(d=>d[1].enH),backgroundColor:'#18b978',borderWidth:0},
    {label:'Fuera/Sin uso',data:topDepts.map(d=>d[1].fuera),backgroundColor:'#ee3f45',borderWidth:0}
  ],{display:ctx=>ctx.dataset.data[ctx.dataIndex]>0,anchor:'end',align:'end',offset:2,formatter:v=>v,color:'#657481',font:{weight:800,size:10}});
  const convEst={abierta:0,completada:0,cerrada:0,contratado:0};
  state.convocatorias.forEach(c=>{const e=c.estado||'abierta';if(Object.hasOwn(convEst,e))convEst[e]++;});
  chart('chart-seleccion','doughnut',['Abierta','Completada','Cerrada','Contratado'],[convEst.abierta,convEst.completada,convEst.cerrada,convEst.contratado],['#20c5dc','#18b978','#657481','#9b59b6'],dlD);
}

function chart(id,type,labels,data,colors,dlOpts){
  if(state.charts[id])state.charts[id].destroy();
  const opts={responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}},datalabels:dlOpts||{display:false}}};
  if(type==='bar')opts.scales={y:{beginAtZero:true,ticks:{precision:0}}};
  state.charts[id]=new Chart(document.getElementById(id),{type,data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},options:opts});
}

function chartH(id,labels,data,colors,dlOpts){
  if(state.charts[id])state.charts[id].destroy();
  state.charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},datalabels:dlOpts||{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}}}}});
}

function chartMulti(id,type,labels,datasets,dlOpts){
  if(state.charts[id])state.charts[id].destroy();
  state.charts[id]=new Chart(document.getElementById(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}},datalabels:dlOpts||{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
}

function descargarExcel(){
  const wb=XLSX.utils.book_new();
  const empleados=state.empleados.map(e=>({
    id:e.id,email:e.email,nombre_completo:e.nombre_completo,empresa:e.empresa,departamento:e.departamento,puesto:e.puesto,telefono:e.telefono,rol:e.rol,
    fecha_ingreso:e.fecha_ingreso,dias_vacaciones_total:e.dias_vacaciones_total,jefe_nombre:e.jefe_nombre,jefe_email:e.jefe_email,created_at:e.created_at,updated_at:e.updated_at
  }));
  const marcajes=state.marcajes.map(m=>{
    const emp=empleadoById(m.user_id);
    return {...m,empleado:emp.nombre_completo||emp.email||'',departamento:emp.departamento||'',puesto:emp.puesto||''};
  });
  const vacaciones=state.vacaciones.map(v=>({...v,...prefijoEmpleado(v.user_id)}));
  const ausencias=state.ausencias.map(a=>({...a,...prefijoEmpleado(a.user_id)}));
  const varias=state.solicitudes.map(s=>({...s,...prefijoEmpleado(s.user_id)}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(empleados),'Empleados');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(marcajes),'Marcajes');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.resumen),'Resumen');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.resumen),'Detalle 4 marcajes');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.fuera),'Fuera horario');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.sinUso),'Sin uso app');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.solicitudesReporte),'Solicitudes');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(vacaciones),'Vacaciones');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ausencias),'Ausencias');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(varias),'Solicitudes varias');
  XLSX.writeFile(wb,`reporte_rrhh_${todayISO()}.xlsx`);
}

function sheetName(name,used=new Set()){
  const base=String(name||'Hoja')
    .replace(/[\[\]\*\/\\\?:]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,31)||'Hoja';
  let final=base;
  let i=2;
  while(used.has(final)){
    const suffix=` ${i++}`;
    final=base.slice(0,31-suffix.length)+suffix;
  }
  used.add(final);
  return final;
}

function preguntaLabel(p,index){
  return String(p?.texto||p?.pregunta||p?.titulo||p?.label||`Pregunta ${index+1}`).trim()||`Pregunta ${index+1}`;
}

function respuestaValor(respuestas,key,index){
  if(!respuestas)return '';
  if(Array.isArray(respuestas)){
    const r=respuestas[index];
    if(r&&typeof r==='object')return r.respuesta??r.valor??r.value??r.texto??'';
    return r??'';
  }
  if(typeof respuestas==='object'){
    const val=respuestas[key]??respuestas[String(index)]??respuestas[index];
    if(val&&typeof val==='object')return val.respuesta??val.valor??val.value??val.texto??'';
    return val??'';
  }
  return '';
}

async function descargarExcelEncuestas(){
  try{
    toast('Preparando reporte de encuestas...');
    const [encRes,respRes]=await Promise.all([
      sb.from('encuestas').select('*').order('created_at',{ascending:false}),
      sb.from('respuestas_encuestas').select('*').order('created_at',{ascending:true})
    ]);
    if(encRes.error)throw encRes.error;
    if(respRes.error)throw respRes.error;
    const encuestas=encRes.data||[];
    const respuestas=respRes.data||[];
    if(!encuestas.length){toast('No hay encuestas para exportar');return}
    const wb=XLSX.utils.book_new();
    const used=new Set();
    const resumen=encuestas.map(e=>{
      const targetEmployees=state.empleados.filter(emp=>!e.departamento||(emp.departamento||'')===e.departamento);
      const totalRespuestas=respuestas.filter(r=>String(r.encuesta_id)===String(e.id)).length;
      return {
        encuesta:e.titulo||e.nombre||e.id,
        area:e.departamento||'Todos',
        activa:Boolean(e.activa),
        cierre:e.fecha_cierre||'',
        preguntas:Array.isArray(e.preguntas)?e.preguntas.length:0,
        empleados_destino:targetEmployees.length,
        respondieron:totalRespuestas,
        pendientes:Math.max(0,targetEmployees.length-totalRespuestas),
        creada:e.created_at||''
      };
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(resumen),sheetName('Resumen encuestas',used));
    encuestas.forEach((enc,idx)=>{
      const preguntas=Array.isArray(enc.preguntas)?enc.preguntas:[];
      const rows=respuestas
        .filter(r=>String(r.encuesta_id)===String(enc.id))
        .map(r=>{
          const emp=empleadoById(r.user_id);
          const row={
            encuesta:enc.titulo||enc.nombre||`Encuesta ${idx+1}`,
            empleado:emp.nombre_completo||emp.email||r.user_id,
            email:emp.email||'',
            area:emp.departamento||'',
            puesto:emp.puesto||'',
            jefe:emp.jefe_nombre||'',
            jefe_email:emp.jefe_email||'',
            respondido_en:r.created_at||''
          };
          preguntas.forEach((p,i)=>{
            const key=p.id||p.key||p.codigo||preguntaLabel(p,i);
            row[preguntaLabel(p,i)]=respuestaValor(r.respuestas,key,i);
          });
          if(!preguntas.length)row.respuestas_json=JSON.stringify(r.respuestas||{});
          return row;
        });
      const targetEmployees=state.empleados.filter(emp=>!enc.departamento||(emp.departamento||'')===enc.departamento);
      const answered=new Set(respuestas.filter(r=>String(r.encuesta_id)===String(enc.id)).map(r=>String(r.user_id)));
      const pendientes=targetEmployees
        .filter(emp=>!answered.has(String(emp.id)))
        .map(emp=>({
          encuesta:enc.titulo||enc.nombre||`Encuesta ${idx+1}`,
          empleado:emp.nombre_completo||emp.email,
          email:emp.email||'',
          area:emp.departamento||'',
          puesto:emp.puesto||'',
          jefe:emp.jefe_nombre||'',
          jefe_email:emp.jefe_email||'',
          estado:'Pendiente'
        }));
      const data=rows.length?rows:[{encuesta:enc.titulo||enc.nombre||`Encuesta ${idx+1}`,estado:'Sin respuestas'}];
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),sheetName(enc.titulo||enc.nombre||`Encuesta ${idx+1}`,used));
      if(pendientes.length){
        XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pendientes),sheetName(`Pendientes ${idx+1}`,used));
      }
    });
    XLSX.writeFile(wb,`reporte_encuestas_${todayISO()}.xlsx`);
    toast('Reporte de encuestas generado');
  }catch(error){
    toast('No se pudo exportar encuestas: '+error.message);
  }
}

function prefijoEmpleado(userId){
  const emp=empleadoById(userId);
  return {
    empleado_nombre:emp.nombre_completo||'',
    empleado_email:emp.email||'',
    empleado_departamento:emp.departamento||'',
    empleado_puesto:emp.puesto||''
  };
}

function descargarPlantilla(){
  const csv='email,password,nombre_completo,empresa,departamento,puesto,telefono,rol,fecha_ingreso,dias_vacaciones_total,jefe_nombre,jefe_email\nempleado@empresa.com,Temporal123,Nombre Empleado,Empresa,Area,Puesto,55555555,empleado,2026-01-15,15,Jefe,jefe@empresa.com\nadmin@empresa.com,Temporal123,Nombre Admin,Empresa,RRHH,Administrador,55555555,admin,2026-01-15,15,,\n';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='plantilla_empleados.csv';
  a.click();
}

function parseCSV(text){
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(c==='"'&&q&&n==='"'){cell+='"';i++}
    else if(c==='"')q=!q;
    else if(c===','&&!q){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r')&&!q){if(cell||row.length){row.push(cell);rows.push(row);row=[];cell=''}if(c==='\r'&&n==='\n')i++}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  const headers=(rows.shift()||[]).map(h=>h.trim());
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])));
}

async function procesarCargaMasiva(){
  const file=document.getElementById('bulk-file').files[0];
  if(!file){toast('Selecciona un CSV');return}
  const empleados=parseCSV(await file.text()).filter(e=>e.email);
  document.getElementById('bulk-result').textContent=`Procesando ${empleados.length} empleados...`;
  try{
    const data=await callFunction('admin-empleados-bulk',{empleados});
    document.getElementById('bulk-result').textContent=JSON.stringify(data,null,2);
    await refreshAll();
  }catch(error){
    document.getElementById('bulk-result').textContent=error.message;
  }
}

async function cargarSolicitudesGestion(){
  const tableEl=document.getElementById('tabla-solicitudes-gestion');
  if(!tableEl)return;
  tableEl.innerHTML=table(['Solicitud'],['<tr><td>Cargando solicitudes...</td></tr>']);
  try{
    const data=await callFunction('solicitudes-gestionar',{action:'list'});
    state.solicitudesGestion=data.solicitudes||[];
    renderSolicitudesGestion();
  }catch(error){
    tableEl.innerHTML=table(['Error'],[`<tr><td class="bad">${escapeHtml(error.message)}</td></tr>`]);
  }
}

function renderSolicitudesGestion(){
  const tableEl=document.getElementById('tabla-solicitudes-gestion');
  if(!tableEl)return;
  const estado=document.getElementById('sol-filtro-estado')?.value||'';
  const tipo=document.getElementById('sol-filtro-tipo')?.value||'';
  const rows=(state.solicitudesGestion||[])
    .filter(s=>!estado||String(s.estado||'pendiente')===estado)
    .filter(s=>!tipo||s.categoria===tipo)
    .map(s=>{
      const emp=s.empleado||{};
      const estadoActual=String(s.estado||'pendiente');
      const detalle=s.detalles||s.motivo||s.tipo||'';
      const rango=s.fecha_inicio?`${s.fecha_inicio}${s.fecha_fin?' - '+s.fecha_fin:''}`:'';
      const acciones=estadoActual==='pendiente'
        ? `<button class="mini" onclick="actualizarSolicitudGestion('${s.categoria}','${s.id}','aprobada')">Aprobar</button>
           <button class="mini secondary" onclick="actualizarSolicitudGestion('${s.categoria}','${s.id}','rechazada')">Rechazar</button>
           ${s.categoria==='solicitudes_varias'?`<button class="mini secondary" onclick="actualizarSolicitudGestion('${s.categoria}','${s.id}','resuelta')">Resolver</button>`:''}`
        : `<button class="mini secondary" onclick="actualizarSolicitudGestion('${s.categoria}','${s.id}','pendiente')">Reabrir</button>`;
      return `<tr>
        <td>${escapeHtml(s.categoria)}</td>
        <td>${escapeHtml(emp.nombre_completo||emp.email||s.user_id)}</td>
        <td>${escapeHtml(emp.departamento||'')}</td>
        <td>${escapeHtml(detalle)}</td>
        <td>${escapeHtml(rango)}</td>
        <td>${escapeHtml(s.dias||'')}</td>
        <td class="${estadoActual==='pendiente'?'bad':'ok'}">${escapeHtml(estadoActual)}</td>
        <td>${escapeHtml(String(s.created_at||'').slice(0,10))}</td>
        <td><div class="row-actions">${acciones}</div></td>
      </tr>`;
    });
  tableEl.innerHTML=table(['Categoria','Empleado','Area','Detalle','Fechas','Dias','Estado','Creado','Accion'],rows.length?rows:['<tr><td colspan="9">Sin solicitudes</td></tr>']);
}

async function actualizarSolicitudGestion(categoria,id,estado){
  if(!confirm(`Marcar solicitud como ${estado}?`))return;
  try{
    await callFunction('solicitudes-gestionar',{action:'update',categoria,id,estado});
    toast('Solicitud actualizada');
    await cargarSolicitudesGestion();
    await refreshAll();
  }catch(error){
    toast(error.message);
  }
}

function applyConsolePermissions(){
  const rol=String(state.profile?.rol||'').toLowerCase();
  const permisos=state.profile?.permisos?.consola || DEFAULT_PERMISOS[rol]?.consola || [];
  document.querySelectorAll('.nav[data-tab]').forEach(btn=>{
    const tab=btn.dataset.tab;
    const allowed=rol==='admin'||(['admin','rrhh'].includes(rol)&&['ubicaciones','capsulas','seleccion'].includes(tab))||permisos.includes(tab);
    btn.classList.toggle('hidden',!allowed);
  });
}

function renderPerfilEditor(){
  const el=document.getElementById('perfil-editor');
  if(!el)return;
  const isAdmin=String(state.profile?.rol||'').toLowerCase()==='admin';
  const roles=['empleado','jefe','rrhh','admin'];
  el.innerHTML=roles.map(role=>{
    const permisos=(state.tiposPerfil.find(p=>p.id===role)?.permisos)||DEFAULT_PERMISOS[role]||{app:[],consola:[]};
    const group=(kind,items)=>`<div class="perm-group"><h3>${kind==='consola'?'Consola':'App'}</h3>${items.map(item=>`<label class="check"><input type="checkbox" data-role="${role}" data-kind="${kind}" value="${item}" ${permisos[kind]?.includes(item)?'checked':''} ${!isAdmin?'disabled':''}> ${item}</label>`).join('')}</div>`;
    return `<section class="profile-card"><h3>${role.toUpperCase()}</h3>${group('consola',CONSOLA_MODULOS)}${group('app',APP_MODULOS)}</section>`;
  }).join('');
}

async function cargarTiposPerfil(){
  const {data,error}=await sb.from('tipos_perfil').select('*');
  state.tiposPerfil=error?[]:(data||[]);
}

async function guardarPermisosPerfil(){
  if(String(state.profile?.rol||'').toLowerCase()!=='admin'){toast('Solo Admin puede modificar permisos');return}
  const roles=['empleado','jefe','rrhh','admin'];
  const rows=roles.map(role=>{
    const permisos={consola:[],app:[]};
    document.querySelectorAll(`#perfil-editor input[data-role="${role}"]`).forEach(input=>{
      if(input.checked)permisos[input.dataset.kind].push(input.value);
    });
    return {id:role,nombre:role.toUpperCase(),permisos,updated_at:new Date().toISOString()};
  });
  const {error}=await sb.from('tipos_perfil').upsert(rows,{onConflict:'id'});
  if(error){toast(error.message);return}
  toast('Permisos guardados');
  await cargarTiposPerfil();
  renderPerfilEditor();
}

function renderNotifTargets(){
  const scope=document.getElementById('notif-scope')?.value||'todos';
  const areaWrap=document.getElementById('notif-area-wrap');
  const usersWrap=document.getElementById('notif-users-wrap');
  if(!areaWrap||!usersWrap)return;
  areaWrap.classList.toggle('hidden',scope!=='departamento');
  usersWrap.classList.toggle('hidden',scope!=='usuarios');

  const areas=[...new Set(state.empleados.map(e=>e.departamento).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  document.getElementById('notif-area').innerHTML=areas.map(a=>`<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');

  document.getElementById('notif-users').innerHTML=state.empleados
    .filter(e=>e.rol!=='admin')
    .map(e=>`<option value="${e.id}">${escapeHtml(e.nombre_completo||e.email)} - ${escapeHtml(e.departamento||'Sin area')}</option>`)
    .join('');
}

function limpiarNotificacion(){
  document.getElementById('notif-titulo').value='';
  document.getElementById('notif-mensaje').value='';
  document.getElementById('notif-scope').value='todos';
  document.getElementById('notif-result').textContent='';
  renderNotifTargets();
}

function aplicarPlantillaNotificacion(tipo){
  const tpl=NOTIF_TEMPLATES[tipo];
  if(!tpl)return;
  document.getElementById('notif-titulo').value=tpl.titulo;
  document.getElementById('notif-mensaje').value=tpl.mensaje;
  showTab('notificaciones');
}

async function enviarNotificacion(){
  const titulo=document.getElementById('notif-titulo').value.trim();
  const mensaje=document.getElementById('notif-mensaje').value.trim();
  const scope=document.getElementById('notif-scope').value;
  const departamento=document.getElementById('notif-area').value;
  const user_ids=[...document.getElementById('notif-users').selectedOptions].map(o=>o.value);
  if(!titulo){toast('Ingresa el titulo');return}
  if(!mensaje){toast('Ingresa el mensaje');return}

  document.getElementById('notif-result').textContent='Enviando...';
  try{
    const data=await callFunction('notificaciones-manage',{action:'broadcast',titulo,mensaje,scope,departamento,user_ids});
    const result=`Notificacion enviada a ${data.inserted||0} empleado(s).`;
    toast('Notificacion enviada');
    limpiarNotificacion();
    document.getElementById('notif-result').textContent=result;
  }catch(error){
    document.getElementById('notif-result').textContent=error.message;
    toast(error.message);
  }
}

// ── ENCUESTAS DE CLIMA ───────────────────────────────────────────────────────
async function cargarEncuestas(){
  const {data,error}=await sb.from('encuestas').select('*').order('created_at',{ascending:false});
  if(error){toast(error.message);return}
  state.encuestas=data||[];
  renderEncuestasAdmin();
}

function renderEncuestasAdmin(){
  const tableEl=document.getElementById('tabla-encuestas');
  if(!tableEl)return;
  const rows=(state.encuestas||[]).map(e=>`<tr>
    <td><strong>${escapeHtml(e.titulo)}</strong></td>
    <td>${escapeHtml(e.departamento||'Todos')}</td>
    <td>${Array.isArray(e.preguntas)?e.preguntas.length:0}</td>
    <td class="${e.activa?'ok':'bad'}">${e.activa?'Activa':'Inactiva'}</td>
    <td>${escapeHtml(e.fecha_cierre||'—')}</td>
    <td>${escapeHtml(String(e.created_at||'').slice(0,10))}</td>
    <td><div class="row-actions">
      <button class="mini" onclick="verResultadosEncuesta('${e.id}')">Resultados</button>
      <button class="mini secondary" onclick="editarEncuesta('${e.id}')">Editar</button>
      <button class="mini secondary" onclick="toggleEncuestaAdmin('${e.id}',${Boolean(e.activa)})">${e.activa?'Desactivar':'Activar'}</button>
      <button class="mini secondary danger" onclick="eliminarEncuestaAdmin('${e.id}')">Eliminar</button>
    </div></td>
  </tr>`);
  tableEl.innerHTML=table(['Título','Área','Preguntas','Estado','Cierre','Creada','Acciones'],rows.length?rows:['<tr><td colspan="7">Sin encuestas creadas</td></tr>']);
}

function addPregunta(tipo){
  encPreguntas.push({_id:Date.now()+Math.random(),tipo,texto:'',opciones:['','']});
  renderPreguntasList();
}

function removePregunta(localId){
  encPreguntas=encPreguntas.filter(p=>String(p._id)!==String(localId));
  renderPreguntasList();
}

function addOpcion(pregId){
  const p=encPreguntas.find(x=>String(x._id)===String(pregId));
  if(p){p.opciones.push('');renderPreguntasList();}
}

function syncEncPreguntas(){
  const ct=document.getElementById('enc-preguntas-list');
  if(!ct)return;
  ct.querySelectorAll('.enc-q-txt').forEach(inp=>{
    const p=encPreguntas.find(x=>String(x._id)===inp.dataset.pregid);
    if(p)p.texto=inp.value;
  });
  ct.querySelectorAll('.enc-op-inp').forEach(inp=>{
    const p=encPreguntas.find(x=>String(x._id)===inp.dataset.pregid);
    if(p)p.opciones[Number(inp.dataset.opidx)]=inp.value;
  });
}

function renderPreguntasList(){
  const ct=document.getElementById('enc-preguntas-list');
  if(!ct)return;
  if(!encPreguntas.length){
    ct.innerHTML='<p class="hint" style="text-align:center;padding:20px;">Sin preguntas. Agrega al menos una usando los botones de arriba.</p>';
    return;
  }
  const TIPO_LABEL={rating:'Calificación 1-5',texto:'Texto libre',opcion:'Opciones'};
  ct.innerHTML=encPreguntas.map((p,i)=>{
    const opcionesHtml=p.tipo==='opcion'
      ?`<div style="margin-top:8px"><div id="ops-${p._id}">${(p.opciones||['','']).map((op,oi)=>`<div style="display:flex;gap:6px;margin-bottom:4px"><input class="enc-op-inp" style="flex:1;padding:7px 10px;border:1px solid var(--line);border-radius:8px;" data-pregid="${p._id}" data-opidx="${oi}" value="${escapeHtml(op)}" placeholder="Opción ${oi+1}"></div>`).join('')}</div><button class="secondary mini" style="margin-top:4px" onclick="syncEncPreguntas();addOpcion('${p._id}')">+ Opción</button></div>`
      :'';
    return `<div style="background:#f7fbfd;border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:.75rem;font-weight:800;color:var(--muted);min-width:22px">${i+1}.</span>
        <span style="font-size:.7rem;background:var(--acc);color:#051014;padding:2px 9px;border-radius:999px;font-weight:800;white-space:nowrap">${TIPO_LABEL[p.tipo]||p.tipo}</span>
        <input style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px;" class="enc-q-txt" data-pregid="${p._id}" value="${escapeHtml(p.texto)}" placeholder="Escribe aquí el texto de la pregunta">
        <button class="mini secondary danger" onclick="syncEncPreguntas();removePregunta('${p._id}')">✕</button>
      </div>
      ${opcionesHtml}
    </div>`;
  }).join('');
}

function limpiarEncuesta(){
  document.getElementById('enc-id').value='';
  document.getElementById('enc-titulo-admin').value='';
  document.getElementById('enc-desc-admin').value='';
  document.getElementById('enc-dept').value='';
  document.getElementById('enc-cierre').value='';
  document.getElementById('enc-activa').value='true';
  encPreguntas=[];
  renderPreguntasList();
}

function editarEncuesta(id){
  const e=state.encuestas.find(x=>String(x.id)===String(id));
  if(!e)return;
  document.getElementById('enc-id').value=e.id;
  document.getElementById('enc-titulo-admin').value=e.titulo||'';
  document.getElementById('enc-desc-admin').value=e.descripcion||'';
  document.getElementById('enc-dept').value=e.departamento||'';
  document.getElementById('enc-cierre').value=e.fecha_cierre||'';
  document.getElementById('enc-activa').value=e.activa?'true':'false';
  encPreguntas=(Array.isArray(e.preguntas)?e.preguntas:[]).map((p,i)=>({
    _id:Date.now()+i,tipo:p.tipo||'rating',texto:p.texto||p.pregunta||'',opciones:p.opciones||['','']
  }));
  renderPreguntasList();
  showTab('encuestas');
  window.scrollTo({top:0,behavior:'smooth'});
}

async function guardarEncuesta(){
  syncEncPreguntas();
  const id=document.getElementById('enc-id').value||null;
  const titulo=document.getElementById('enc-titulo-admin').value.trim();
  const descripcion=document.getElementById('enc-desc-admin').value.trim();
  const departamento=document.getElementById('enc-dept').value.trim();
  const fecha_cierre=document.getElementById('enc-cierre').value||null;
  const activa=document.getElementById('enc-activa').value==='true';
  if(!titulo){toast('Ingresa el título de la encuesta');return}
  if(!encPreguntas.length){toast('Agrega al menos una pregunta');return}
  const preguntas=encPreguntas.map(p=>({
    tipo:p.tipo,texto:p.texto,
    ...(p.tipo==='opcion'?{opciones:(p.opciones||[]).filter(o=>o.trim())}:{})
  }));
  const row={titulo,descripcion:descripcion||null,preguntas,activa,departamento:departamento||null,fecha_cierre,updated_at:new Date().toISOString()};
  const result=id
    ?await sb.from('encuestas').update(row).eq('id',id).select('id').single()
    :await sb.from('encuestas').insert({...row,created_by:state.user.id}).select('id').single();
  const {data,error}=result;
  if(error){toast(error.message);return}
  if(!id&&activa){
    callFunction('notificaciones-manage',{
      action:'broadcast',
      titulo:'Nueva encuesta de clima',
      mensaje:`RRHH publico una nueva encuesta: ${titulo}. Por favor respondela desde el modulo Encuestas de clima.`,
      scope:departamento?'departamento':'todos',
      departamento:departamento||''
    }).catch(e=>console.error('No se pudo notificar encuesta:', e));
  }
  toast(id?'Encuesta actualizada':'Encuesta creada');
  limpiarEncuesta();
  await cargarEncuestas();
}

async function toggleEncuestaAdmin(id,activa){
  const {error}=await sb.from('encuestas').update({activa:!activa,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){toast(error.message);return}
  toast(activa?'Encuesta desactivada':'Encuesta activada');
  await cargarEncuestas();
}

async function eliminarEncuestaAdmin(id){
  if(!confirm('Eliminar esta encuesta y todas sus respuestas? Esta accion no se puede deshacer.'))return;
  const {error}=await sb.from('encuestas').delete().eq('id',id);
  if(error){toast(error.message);return}
  toast('Encuesta eliminada');
  await cargarEncuestas();
}

async function verResultadosEncuesta(id){
  const enc=state.encuestas.find(x=>String(x.id)===String(id));
  if(!enc)return;
  const {data:resp,error}=await sb.from('respuestas_encuestas').select('*').eq('encuesta_id',id);
  if(error){toast(error.message);return}
  const total=resp?.length||0;
  const preguntas=Array.isArray(enc.preguntas)?enc.preguntas:[];
  const targetEmployees=state.empleados
    .filter(e=>!['admin','rrhh'].includes(String(e.rol||'').toLowerCase()))
    .filter(e=>!enc.departamento||String(e.departamento||'')===String(enc.departamento||''));
  const respByUser=new Map((resp||[]).map(r=>[String(r.user_id),r]));
  const respondieron=targetEmployees.filter(e=>respByUser.has(String(e.id)));
  const pendientes=targetEmployees.filter(e=>!respByUser.has(String(e.id)));
  let html=`<h2>${escapeHtml(enc.titulo)}</h2><p class="hint" style="margin-bottom:18px">${total} respuesta(s) totales · ${pendientes.length} pendiente(s)</p>`;
  if(!total){html+='<p class="hint" style="text-align:center;padding:24px">Aún no hay respuestas para esta encuesta.</p>';}
  preguntas.forEach((p,i)=>{
    html+=`<div style="background:#f7fbfd;border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px">`;
    html+=`<div style="font-weight:800;font-size:.9rem;margin-bottom:10px">${i+1}. ${escapeHtml(p.texto||p.pregunta||'')}</div>`;
    if(p.tipo==='rating'){
      const vals=(resp||[]).map(r=>Number(r.respuestas?.[i]||0)).filter(Boolean);
      const avg=vals.length?(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2):'—';
      html+=`<div style="font-size:2rem;font-weight:900;color:var(--acc2)">${avg}<span style="font-size:.85rem;color:var(--muted);margin-left:6px">/5</span></div>`;
      html+=`<div style="font-size:.75rem;color:var(--muted);margin-top:2px">Promedio · ${vals.length} respuesta(s)</div>`;
      const dist=[1,2,3,4,5].map(n=>({n,cnt:vals.filter(v=>v===n).length}));
      html+=`<div style="margin-top:10px">${dist.map(d=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span style="min-width:16px;font-size:.78rem;font-weight:800">${d.n}</span><div style="height:10px;background:var(--acc);border-radius:4px;width:${vals.length?Math.round(d.cnt/vals.length*100):0}%;min-width:${d.cnt?'8px':'2px'}"></div><span style="font-size:.75rem;color:var(--muted)">${d.cnt}</span></div>`).join('')}</div>`;
    }else if(p.tipo==='opcion'&&Array.isArray(p.opciones)){
      const counts=Object.fromEntries(p.opciones.map(op=>[op,0]));
      (resp||[]).forEach(r=>{const v=r.respuestas?.[i];if(v&&counts[v]!==undefined)counts[v]++;});
      html+=Object.entries(counts).map(([op,cnt])=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span style="min-width:130px;font-size:.83rem">${escapeHtml(op)}</span><div style="height:14px;background:var(--acc);border-radius:4px;width:${total?Math.round(cnt/total*100):0}%;min-width:${cnt?'14px':'2px'}"></div><span style="font-size:.8rem;font-weight:800">${cnt}</span></div>`).join('');
    }else{
      const textos=(resp||[]).map(r=>r.respuestas?.[i]).filter(Boolean);
      html+=textos.length?textos.slice(0,30).map(t=>`<div style="font-size:.82rem;background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:4px">"${escapeHtml(String(t))}"</div>`).join(''):`<span style="color:var(--muted);font-size:.82rem">Sin respuestas</span>`;
    }
    html+='</div>';
  });
  html+=`<div style="background:#f7fbfd;border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px">
    <h3 style="margin:0 0 10px;font-size:.88rem">Respondieron (${respondieron.length})</h3>
    <div class="table-wrap" style="max-height:260px"><table>${table(['Empleado','Área','Jefe','Fecha'],respondieron.map(e=>{
      const r=respByUser.get(String(e.id));
      return `<tr><td>${escapeHtml(e.nombre_completo||e.email)}</td><td>${escapeHtml(e.departamento||'')}</td><td>${escapeHtml(e.jefe_nombre||'')}</td><td>${escapeHtml(String(r?.created_at||'').slice(0,16).replace('T',' '))}</td></tr>`;
    }))}</table></div>
  </div>`;
  html+=`<div style="background:#fff8f8;border:1px solid #ffd6d6;border-radius:12px;padding:14px;margin-bottom:12px">
    <h3 style="margin:0 0 10px;font-size:.88rem;color:var(--red)">Pendientes (${pendientes.length})</h3>
    <div class="table-wrap" style="max-height:260px"><table>${table(['Empleado','Área','Jefe','Correo'],pendientes.map(e=>`<tr><td>${escapeHtml(e.nombre_completo||e.email)}</td><td>${escapeHtml(e.departamento||'')}</td><td>${escapeHtml(e.jefe_nombre||'')}</td><td>${escapeHtml(e.email||'')}</td></tr>`))}</table></div>
  </div>`;
  document.getElementById('modal-resultados-content').innerHTML=html;
  document.getElementById('modal-resultados-enc').classList.remove('hidden');
}

// ── CONFIGURACION EMPRESA (White-label) ───────────────────────────────────────
async function cargarConfigEmpresa(){
  const {data,error}=await sb.from('configuracion_empresa').select('*').limit(1).single();
  if(error&&error.code!=='PGRST116'){toast('No se pudo cargar la configuración: '+error.message);return}
  if(data){
    document.getElementById('conf-id').value=data.id||'';
    document.getElementById('conf-nombre').value=data.nombre_empresa||'';
    if(data.color_primario)document.getElementById('conf-color1').value=data.color_primario;
    if(data.color_secundario)document.getElementById('conf-color2').value=data.color_secundario;
    document.getElementById('conf-foto-marcaje').checked=Boolean(data.foto_marcaje_activa);
    if(data.logo_url){
      document.getElementById('conf-logo-img').src=data.logo_url;
      document.getElementById('conf-logo-preview').style.display='block';
    }
  }
}

async function guardarConfigEmpresa(){
  const id=document.getElementById('conf-id').value||null;
  const nombre_empresa=document.getElementById('conf-nombre').value.trim()||'People 360';
  const color_primario=document.getElementById('conf-color1').value;
  const color_secundario=document.getElementById('conf-color2').value;
  const foto_marcaje_activa=document.getElementById('conf-foto-marcaje').checked;
  const result=document.getElementById('conf-result');
  result.textContent='Guardando...';
  let logo_url=null;
  const logoFile=document.getElementById('conf-logo-file').files[0];
  if(logoFile){
    if(logoFile.size>2*1024*1024){toast('El logo no debe superar 2 MB');result.textContent='';return}
    const ext=logoFile.name.split('.').pop()||'png';
    const path=`logo-${Date.now()}.${ext}`;
    const {error:upErr}=await sb.storage.from('empresa-logos').upload(path,logoFile,{upsert:true,contentType:logoFile.type||'image/png'});
    if(upErr){toast('Error al subir logo: '+upErr.message);result.textContent=upErr.message;return}
    const {data:{publicUrl}}=sb.storage.from('empresa-logos').getPublicUrl(path);
    logo_url=publicUrl;
    document.getElementById('conf-logo-img').src=publicUrl;
    document.getElementById('conf-logo-preview').style.display='block';
  }
  const patch={nombre_empresa,color_primario,color_secundario,foto_marcaje_activa,updated_at:new Date().toISOString()};
  if(logo_url)patch.logo_url=logo_url;
  const {error}=id
    ?await sb.from('configuracion_empresa').update(patch).eq('id',id)
    :await sb.from('configuracion_empresa').insert(patch);
  if(error){toast(error.message);result.textContent=error.message;return}
  toast('Configuración guardada');
  result.textContent='Configuración guardada correctamente';
  await cargarConfigEmpresa();
}

// ── LINKEDIN CANDIDATE SEARCH ────────────────────────────────
const LINKEDIN_WEBHOOK_DEFAULT='http://localhost:5678/webhook/people360-linkedin-search';
let liPollInterval=null;

function linkedinWebhookUrl(){
  const input=document.getElementById('li-webhook');
  const value=(input?.value||'').trim();
  if(value){
    localStorage.setItem('people360-linkedin-webhook',value);
    return value;
  }
  return LINKEDIN_WEBHOOK_DEFAULT;
}

function mostrarTabLinkedIn(){
  const sel=document.getElementById('li-plaza-select');
  const webhookInput=document.getElementById('li-webhook');
  if(webhookInput&&!webhookInput.value){
    webhookInput.value=localStorage.getItem('people360-linkedin-webhook')||LINKEDIN_WEBHOOK_DEFAULT;
  }
  if(sel){
    const prev=sel.value;
    sel.innerHTML='<option value="">— Selecciona una plaza —</option>'+
      state.convocatorias.map(c=>`<option value="${c.id}"${String(c.id)===String(state.convocatoriaActual)||String(c.id)===prev?'selected':''}>${escapeHtml(c.titulo||c.puesto||'Plaza sin nombre')} (${c.estado})</option>`).join('');
    const chosen=sel.value;
    if(chosen)seleccionarPlazaLinkedIn(chosen);
    else{
      document.getElementById('li-search-section')?.classList.add('hidden');
      document.getElementById('li-no-selection')?.classList.remove('hidden');
    }
  }
}

function seleccionarPlazaLinkedIn(id){
  const liSearch=document.getElementById('li-search-section');
  const liNo=document.getElementById('li-no-selection');
  if(!id){
    liSearch?.classList.add('hidden');
    liNo?.classList.remove('hidden');
    return;
  }
  const c=state.convocatorias.find(x=>String(x.id)===String(id));
  if(!c)return;
  liSearch?.classList.remove('hidden');
  liNo?.classList.add('hidden');
  const info=document.getElementById('li-plaza-info');
  if(info)info.innerHTML=`<strong>${escapeHtml(c.titulo||c.puesto||'Sin nombre')}</strong> &nbsp;·&nbsp; ${escapeHtml(c.puesto||'')} &nbsp;·&nbsp; <span style="color:var(--acc)">${c.estado}</span>`;
  const liQ=document.getElementById('li-query');
  if(liQ&&c.puesto&&!liQ.value)liQ.value=c.puesto;
  cargarProspectos(id);
}

function liPlazaActual(){
  const sel=document.getElementById('li-plaza-select');
  const id=sel?.value;
  if(!id)return null;
  return state.convocatorias.find(c=>String(c.id)===String(id))||null;
}

function cleanLinkedInUrl(raw){
  const value=String(raw||'').trim();
  if(!value)return '';
  try{
    const url=new URL(value);
    const host=url.hostname.toLowerCase();
    if(host.includes('linkedin.com'))return url.href;
    if(host==='translate.google.com'){
      const wrapped=url.searchParams.get('u')||url.searchParams.get('url');
      if(wrapped)return cleanLinkedInUrl(wrapped);
    }
  }catch(e){
    return '';
  }
  return '';
}

function linkedInSearchUrl(prospecto){
  const q=[
    prospecto?.nombre,
    prospecto?.titulo_actual,
    prospecto?.empresa_actual,
    'LinkedIn'
  ].filter(Boolean).join(' ');
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;
}

async function buscarEnLinkedIn(){
  const actual=liPlazaActual();
  if(!actual){toast('Selecciona una plaza primero');return;}
  const query=document.getElementById('li-query').value.trim();
  if(!query){toast('Ingresa los términos de búsqueda');return;}
  const max=parseInt(document.getElementById('li-max').value)||5;
  const status=document.getElementById('li-status');
  const ct=document.getElementById('li-results');
  status.textContent='Enviando búsqueda a n8n...';
  ct.innerHTML='';
  if(liPollInterval)clearInterval(liPollInterval);
  try{
    const webhookUrl=linkedinWebhookUrl();
    const res=await fetch(webhookUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({convocatoria_id:actual.id,query,requisitos:actual.requisitos||'',max_results:max})
    });
    if(!res.ok)throw new Error('No se pudo conectar con n8n ('+res.status+')');
  }catch(e){
    status.textContent='Error: '+e.message+'. Verifica que el webhook de n8n sea público/alcanzable desde esta consola.';
    return;
  }
  status.innerHTML='<span style="color:var(--acc)">&#8635; Analizando perfiles con IA... esto puede tomar 20-40 segundos.</span>';
  const startCount=(await sb.from('seleccion_prospectos').select('id',{count:'exact',head:true}).eq('convocatoria_id',actual.id)).count||0;
  let attempts=0;
  liPollInterval=setInterval(async()=>{
    attempts++;
    const {data,count}=await sb.from('seleccion_prospectos').select('*',{count:'exact'}).eq('convocatoria_id',actual.id).order('score_match',{ascending:false});
    if(count>startCount){
      clearInterval(liPollInterval);
      status.textContent=`${count} perfiles encontrados y analizados.`;
      renderProspectos(data||[],ct);
    }
    if(attempts>=20){
      clearInterval(liPollInterval);
      if(!count||count<=startCount) status.textContent='No se encontraron nuevos resultados. Revisa los logs de n8n.';
    }
  },3000);
}

async function cargarProspectos(convocatoriaId){
  const ct=document.getElementById('li-results');
  const status=document.getElementById('li-status');
  if(!ct)return;
  const {data,count}=await sb.from('seleccion_prospectos').select('*',{count:'exact'}).eq('convocatoria_id',convocatoriaId).order('score_match',{ascending:false});
  if(count>0){
    if(status)status.textContent=`${count} perfiles guardados para esta plaza.`;
    renderProspectos(data||[],ct);
  }else{
    ct.innerHTML='';
    if(status)status.textContent='';
  }
}

function renderProspectos(prospectos,ct){
  if(!prospectos.length){ct.innerHTML='<p class="hint">Sin resultados aún.</p>';return;}
  ct.innerHTML=prospectos.map(p=>{
    const score=p.score_match||0;
    const cls=score>=70?'li-alto':score>=40?'li-medio':'li-bajo';
    const estadoCls={'prospecto':'badge-blue','contactado':'badge-green','descartado':'badge-gray'}[p.estado]||'badge-gray';
    const linkedinUrl=cleanLinkedInUrl(p.linkedin_url);
    const fallbackUrl=linkedInSearchUrl(p);
    const linkButton=linkedinUrl
      ? `<a href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noopener" class="li-btn-ver">Ver en LinkedIn ↗</a>`
      : `<a href="${escapeHtml(fallbackUrl)}" target="_blank" rel="noopener" class="li-btn-ver li-btn-warn" title="n8n no devolvió un enlace directo válido">Buscar en LinkedIn ↗</a>`;
    return `<div class="li-card">
      <div class="li-card-top">
        <div class="li-info">
          <strong>${escapeHtml(p.nombre||'Sin nombre')}</strong>
          <span>${escapeHtml(p.titulo_actual||'')}${p.empresa_actual?' · '+escapeHtml(p.empresa_actual):''}</span>
          ${p.ubicacion?`<span style="color:var(--muted);font-size:.78rem">${escapeHtml(p.ubicacion)}</span>`:''}
        </div>
        <div class="li-right">
          <div class="li-score ${cls}">${score}</div>
          <span class="status-badge ${estadoCls}" style="font-size:.7rem">${p.estado}</span>
        </div>
      </div>
      ${p.resumen_ia?`<p class="li-resumen">${escapeHtml(p.resumen_ia)}</p>`:''}
      <div class="li-actions">
        ${linkButton}
        <button class="mini secondary" onclick="estadoProspecto('${p.id}','contactado')">Contactado</button>
        <button class="mini secondary" onclick="estadoProspecto('${p.id}','descartado')">Descartar</button>
      </div>
    </div>`;
  }).join('');
}

async function estadoProspecto(id,estado){
  const {error}=await sb.from('seleccion_prospectos').update({estado}).eq('id',id);
  if(error){toast(error.message);return;}
  toast('Estado actualizado');
  const actual=liPlazaActual();
  if(actual)cargarProspectos(actual.id);
}

async function limpiarProspectos(){
  const actual=liPlazaActual();
  if(!actual)return;
  if(!confirm('¿Eliminar todos los prospectos de LinkedIn de esta plaza?'))return;
  const {error}=await sb.from('seleccion_prospectos').delete().eq('convocatoria_id',actual.id);
  if(error){toast(error.message);return;}
  toast('Prospectos eliminados');
  document.getElementById('li-results').innerHTML='';
  document.getElementById('li-status').textContent='';
}

window.addEventListener('DOMContentLoaded',async()=>{
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    const savedRaw=sessionStorage.getItem('people360-tab');
    const savedTab=CONSOLA_MODULOS.includes(savedRaw)?savedRaw:'dashboard';
    const ok=await enterConsole(session.user,null,savedTab||null);
    document.documentElement.removeAttribute('data-restoring');
  } else {
    document.documentElement.removeAttribute('data-restoring');
  }
});

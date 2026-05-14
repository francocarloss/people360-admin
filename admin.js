const SUPA_URL='https://xtotumsgwvltagwdwyuh.supabase.co';
const SUPA_KEY='sb_publishable_i80iCeD0hfF3P38YlObsJg_runGr68-';
const sb=supabase.createClient(SUPA_URL,SUPA_KEY);

const state={user:null,profile:null,empleados:[],marcajes:[],vacaciones:[],ausencias:[],solicitudes:[],solicitudesReporte:[],solicitudesGestion:[],tiposPerfil:[],ubicaciones:[],capsulas:[],convocatorias:[],candidatos:[],convocatoriaActual:null,resumen:[],sinUso:[],fuera:[],charts:{}};
const DEFAULT_PERMISOS={
  empleado:{app:['home','checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas'],consola:[]},
  jefe:{app:['home','checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas','autorizar_vacaciones'],consola:[]},
  rrhh:{app:['home','checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas'],consola:['dashboard','empleados','asistencia','ubicaciones','capsulas','seleccion','solicitudes','notificaciones','reportes']},
  admin:{app:['home','checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas','autorizar_vacaciones'],consola:['dashboard','empleados','asistencia','ubicaciones','capsulas','seleccion','solicitudes','notificaciones','reportes','perfiles']}
};
const CONSOLA_MODULOS=['dashboard','empleados','asistencia','ubicaciones','capsulas','seleccion','solicitudes','notificaciones','reportes','perfiles'];
const APP_MODULOS=['home','checkin','datos','ausencias','vacaciones','solicitudes_varias','notificaciones','capsulas','autorizar_vacaciones'];
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
  msg.textContent='Validando...';
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-pass').value;
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){msg.textContent=error.message;return}
  await enterConsole(data.user,msg);
}

async function enterConsole(user,msgEl=null){
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
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.id===id));
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  document.getElementById('page-title').textContent={dashboard:'Dashboard',empleados:'Empleados',asistencia:'Asistencia',ubicaciones:'Ubicaciones',capsulas:'Capsulas',seleccion:'Seleccion',solicitudes:'Solicitudes',notificaciones:'Notificaciones',reportes:'Reportes',perfiles:'Perfiles'}[id]||id;
  if(id==='notificaciones')renderNotifTargets();
  if(id==='solicitudes')cargarSolicitudesGestion();
  if(id==='ubicaciones')cargarUbicaciones();
  if(id==='capsulas')cargarCapsulas();
  if(id==='seleccion')cargarSeleccion();
  if(id==='perfiles')renderPerfilEditor();
}

async function refreshAll(){
  const desde=document.getElementById('fecha-desde').value||todayISO();
  const hasta=document.getElementById('fecha-hasta').value||desde;
  const [empleadosRes,marcajesRes,vacacionesRes,ausenciasRes,solicitudesRes,ubicacionesRes]=await Promise.all([
    sb.from('profiles').select('*').order('nombre_completo',{ascending:true}),
    sb.from('marcajes').select('*').gte('created_at',`${desde}T00:00:00`).lte('created_at',`${hasta}T23:59:59`).order('created_at',{ascending:true}),
    sb.from('vacaciones').select('*').gte('created_at',`${desde}T00:00:00`).lte('created_at',`${hasta}T23:59:59`).order('created_at',{ascending:false}),
    sb.from('ausencias').select('*').gte('created_at',`${desde}T00:00:00`).lte('created_at',`${hasta}T23:59:59`).order('created_at',{ascending:false}),
    sb.from('solicitudes_varias').select('*').gte('created_at',`${desde}T00:00:00`).lte('created_at',`${hasta}T23:59:59`).order('created_at',{ascending:false}),
    sb.from('ubicaciones').select('*').order('created_at',{ascending:false})
  ]);
  if(empleadosRes.error){toast(empleadosRes.error.message);return}
  if(marcajesRes.error){toast(marcajesRes.error.message);return}
  state.empleados=empleadosRes.data||[];
  state.marcajes=marcajesRes.data||[];
  state.vacaciones=vacacionesRes.data||[];
  state.ausencias=ausenciasRes.data||[];
  state.solicitudes=solicitudesRes.data||[];
  state.ubicaciones=ubicacionesRes.data||[];
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
  const marcaron=state.resumen.filter(r=>r.marcajes>0).length;
  const correctos=state.resumen.filter(r=>r.en_horario).length;
  document.getElementById('m-empleados').textContent=state.empleados.length;
  document.getElementById('m-marcaron').textContent=marcaron;
  document.getElementById('m-correctos').textContent=correctos;
  document.getElementById('m-sinuso').textContent=state.sinUso.length;
  const pendientes=state.solicitudesReporte.filter(s=>String(s.estado||'pendiente')==='pendiente').length;
  document.getElementById('m-solicitudes').textContent=pendientes;
  renderEmpleados();
  renderNotifTargets();
  renderUbicaciones();
  renderSeleccion();
  renderTables();
  renderCharts(correctos,marcaron-correctos,state.sinUso.length,marcaron);
  applyConsolePermissions();
}

function table(headers,rows){
  return `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>`;
}

function renderEmpleados(){
  const rows=state.empleados.map(e=>`<tr><td>${escapeHtml(e.nombre_completo)}</td><td>${escapeHtml(e.email)}</td><td>${escapeHtml(e.departamento)}</td><td>${escapeHtml(e.puesto)}</td><td>${escapeHtml(e.rol)}</td><td>${escapeHtml(e.jefe_email||'')}</td><td>${escapeHtml(e.fecha_ingreso||'')}</td><td><button class="mini secondary" onclick="editarEmpleado('${e.id}')">Editar</button></td></tr>`);
  document.getElementById('tabla-empleados').innerHTML=table(['Nombre','Email','Area','Puesto','Rol','Correo vacaciones','Ingreso','Accion'],rows);
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
const SELECCION_WEBHOOK_DEFAULT='http://localhost:5678/webhook/people360-seleccion';

function selectedConvocatoria(){
  return state.convocatorias.find(c=>String(c.id)===String(state.convocatoriaActual))||null;
}

function seleccionWebhook(){
  return document.getElementById('sel-webhook')?.value.trim() || localStorage.getItem('people360-seleccion-webhook') || SELECCION_WEBHOOK_DEFAULT;
}

async function cargarSeleccion(){
  const webhook=localStorage.getItem('people360-seleccion-webhook')||SELECCION_WEBHOOK_DEFAULT;
  const webhookInput=document.getElementById('sel-webhook');
  if(webhookInput&&!webhookInput.value)webhookInput.value=webhook;

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
    const selected=String(state.convocatoriaActual)===String(c.id)?'ok':'';
    return `<tr>
      <td><button class="mini secondary" onclick="seleccionarConvocatoria('${c.id}')">Seleccionar</button></td>
      <td class="${selected}">${escapeHtml(c.titulo)}</td>
      <td>${escapeHtml(c.puesto||'')}</td>
      <td>${escapeHtml(c.estado||'abierta')}</td>
      <td>${total}</td>
      <td>${escapeHtml(c.recomendado_nombre||'-')}</td>
      <td>${new Date(c.created_at).toLocaleDateString('es-GT')}</td>
    </tr>`;
  });
  convTable.innerHTML=table(['Accion','Convocatoria','Puesto','Estado','CVs','Recomendado','Creada'],convRows);

  const actual=selectedConvocatoria();
  const current=document.getElementById('sel-current');
  if(current)current.textContent=actual?`Convocatoria seleccionada: ${actual.titulo}`:'Selecciona una convocatoria.';

  const candidatos=actual?state.candidatos.filter(c=>c.convocatoria_id===actual.id):[];
  const candRows=candidatos.map(c=>{
    const score=c.puntaje_total!==null&&c.puntaje_total!==undefined?`${c.puntaje_total}/100`:'-';
    const cumple=c.cumple_requisitos===true?'Si':c.cumple_requisitos===false?'No':'-';
    return `<tr>
      <td>${escapeHtml(c.nombre_candidato||c.nombre_archivo||'Candidato')}</td>
      <td>${escapeHtml(c.nombre_archivo||'')}</td>
      <td>${escapeHtml(c.estado||'pendiente')}</td>
      <td>${score}</td>
      <td>${cumple}</td>
      <td>${c.recomendado?'Si':'No'}</td>
      <td>${escapeHtml(c.resumen||'-')}</td>
      <td>${escapeHtml(c.riesgos||'-')}</td>
    </tr>`;
  });
  candTable.innerHTML=table(['Candidato','Archivo','Estado','Puntaje','Cumple','Recomendado','Resumen','Alertas'],candRows);
}

function seleccionarConvocatoria(id){
  state.convocatoriaActual=id;
  const c=selectedConvocatoria();
  if(c){
    document.getElementById('sel-titulo').value=c.titulo||'';
    document.getElementById('sel-puesto').value=c.puesto||'';
    document.getElementById('sel-requisitos').value=c.requisitos||'';
  }
  renderSeleccion();
}

async function crearConvocatoria(){
  const titulo=document.getElementById('sel-titulo').value.trim();
  const puesto=document.getElementById('sel-puesto').value.trim();
  const requisitos=document.getElementById('sel-requisitos').value.trim();
  const webhook=seleccionWebhook();
  if(webhook)localStorage.setItem('people360-seleccion-webhook',webhook);
  if(!titulo){toast('Ingresa el nombre de la convocatoria');return}
  if(!requisitos){toast('Ingresa los requisitos del puesto');return}
  const row={titulo,puesto,requisitos,estado:'abierta',created_by:state.user.id,updated_at:new Date().toISOString()};
  const {data,error}=await sb.from('seleccion_convocatorias').insert(row).select('*').single();
  if(error){toast(error.message);return}
  state.convocatoriaActual=data.id;
  toast('Convocatoria creada');
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

async function analizarConvocatoriaSeleccion(){
  const actual=selectedConvocatoria();
  if(!actual){toast('Selecciona una convocatoria');return}
  const webhook=seleccionWebhook();
  if(!webhook){toast('Configura el webhook de n8n');return}
  localStorage.setItem('people360-seleccion-webhook',webhook);
  const candidatos=state.candidatos.filter(c=>c.convocatoria_id===actual.id);
  if(!candidatos.length){toast('Carga al menos un CV');return}
  await sb.from('seleccion_convocatorias').update({estado:'analizando',updated_at:new Date().toISOString()}).eq('id',actual.id);
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
        candidatos:candidatos.map(c=>({id:c.id,nombre_archivo:c.nombre_archivo,bucket:c.storage_bucket,path:c.storage_path,mime_type:c.mime_type}))
      })
    });
    const text=await res.text();
    if(!res.ok)throw new Error(text||`Error ${res.status} en n8n`);
    toast('Analisis enviado a n8n');
  }catch(error){
    await sb.from('seleccion_convocatorias').update({estado:'abierta',updated_at:new Date().toISOString()}).eq('id',actual.id);
    toast(error.message);
  }
  await cargarSeleccion();
}

function nuevoEmpleado(){
  ['emp-id','emp-nombre','emp-email','emp-password','emp-empresa','emp-departamento','emp-puesto','emp-telefono','emp-fecha-ingreso','emp-jefe-nombre','emp-jefe-email'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('emp-rol').value='empleado';
  document.getElementById('emp-vacaciones').value='15';
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
    jefe_email:document.getElementById('emp-jefe-email').value.trim()
  };
}

async function guardarEmpleado(){
  const empleado=empleadoFormData();
  if(!empleado.email){toast('Ingresa el correo de acceso');return}
  if(!empleado.nombre_completo){toast('Ingresa el nombre completo');return}
  try{
    const data=await callFunction('admin-empleado-save',{empleado});
    if(data&&data.error){toast(data.error);return}
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

function renderCharts(correctos,fuera,sinUso,conUso){
  chart('chart-puntualidad','doughnut',['En horario','Fuera'],[correctos,fuera],['#18b978','#ee3f45']);
  chart('chart-uso','bar',['Usan app','Sin uso'],[conUso,sinUso],['#20c5dc','#101820']);
  const pendientes=state.solicitudesReporte.filter(s=>s.estado==='pendiente').length;
  const aprobadas=state.solicitudesReporte.filter(s=>s.estado==='aprobada').length;
  const otras=Math.max(0,state.solicitudesReporte.length-pendientes-aprobadas);
  chart('chart-solicitudes','doughnut',['Pendientes','Aprobadas','Otras'],[pendientes,aprobadas,otras],['#ee3f45','#18b978','#20c5dc']);
}

function chart(id,type,labels,data,colors){
  if(state.charts[id])state.charts[id].destroy();
  state.charts[id]=new Chart(document.getElementById(id),{
    type,
    data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}}
  });
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

window.addEventListener('DOMContentLoaded',async()=>{
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    document.getElementById('login-email').value=session.user.email||'';
    document.getElementById('login-msg').textContent='Restaurando sesion...';
    await enterConsole(session.user);
  }
});


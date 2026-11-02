/* global chrome */
// This content script runs only on the explicitly allowed CMA form/account/login pages.
const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const field=id=>{const el=document.getElementById(id);if(!el)throw Error('form_changed');return el;};
function setValue(el,value){if(el.disabled)throw Error('field_disabled');const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));}
function challenge(){return !!document.querySelector('iframe[src*="captcha"],input[autocomplete="one-time-code"],input[name="otp"]')||/verify you are human|access denied|unusual traffic/i.test(document.body.innerText);}
let prepared=null,clicked=false,loginAttempted=false;
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||!message?.action?.startsWith('cbi-cma-'))return;
 (async()=>{
  if(challenge())return {state:'verification_required'};
  if(location.origin==='https://auth.cma-cgm.com'){
   if(message.action!=='cbi-cma-login'||loginAttempted)return {state:'login_required'};
   const inputs=[...document.querySelectorAll('input')];
   const password=inputs.find(i=>i.type==='password'&&visible(i));
   const email=inputs.find(i=>visible(i)&&['email','text'].includes(i.type)&&/email|username/i.test(i.name+' '+i.id+' '+i.getAttribute('aria-label')));
   const button=[...document.querySelectorAll('button,input[type=submit]')].find(e=>/^(log in|login)$/i.test((e.innerText||e.value||'').trim()));
   if(!email||!password||!button)return {state:'login_form_changed'};
   if(!message.credentials?.username||!message.credentials?.password)return {state:'credentials_missing'};
   loginAttempted=true;setValue(email,message.credentials.username);setValue(password,message.credentials.password);button.click();return {state:'login_started'};
  }
  if(location.origin!=='https://www.cma-cgm.com')return {state:'wrong_origin'};
  if(message.action==='cbi-cma-account'&&location.pathname==='/ebusiness/account/edit'){
   const email=document.querySelector('#easyreg-login');return email?.value?{state:'account',account:email.value.trim()}:{state:'account_unavailable'};
  }
  if(location.pathname!=='/ebusiness/vgm/declaration')return {state:'wrong_page'};
  if(message.action==='cbi-cma-result'){
   const success=document.querySelector('#submitsucess');
   if(visible(success)&&/VGM Submitted and pending validation/i.test(success.textContent))return {state:'submitted',message:'VGM Submitted and pending validation.'};
   const errors=[...document.querySelectorAll('[id^="spanError"],.field-validation-error,.validation-summary-errors')].filter(e=>visible(e)&&e.textContent.trim());
   if(errors.length)return {state:'validation_failed',message:'CMA alan doğrulaması gönderimi durdurdu: '+errors.map(e=>e.textContent.trim()).join(' ').slice(0,300)};
   return {state:'unknown'};
  }
  if(message.action==='cbi-cma-prepare'){
   const p=message.payload;
   if(visible(document.querySelector('#submitsucess')))throw Error('stale_success_page');
   if(!p||p.carrier!=='cma-cgm'||p.unit!=='KGM'||!['','SM1','SM2'].includes(p.method))throw Error('invalid_payload');
   if(document.querySelectorAll('[id^="booking-"]').length!==1)throw Error('unexpected_container_count');
   const unit=document.querySelector('input[name=unit][value="1"]');if(!unit)throw Error('unit_missing');if(!unit.checked){unit.click();unit.dispatchEvent(new Event('change',{bubbles:true}));}
   setValue(field('booking-0'),p.booking);setValue(field('number-0'),p.container);
   // Allow carrier-owned booking/container lookups to finish before assigning weights.
   // CMA's asynchronous container lookup clears VGM on completion. Wait for
   // carrier evidence instead of racing that lookup with a fixed delay.
   let ready=false,stable=0;
   for(let attempt=0;attempt<90;attempt++){
    const tare=document.querySelector('[data-bind="text:Tare"]');
    const bookingBusy=visible(document.getElementById('bookingLoading-0'));
    const loaded=visible(tare)&&Number((tare.textContent||'').replace(/,/g,''))>0&&!bookingBusy;
    stable=loaded?stable+1:0;
    if(stable>=3){ready=true;break;}
    await delay(500);
   }
   if(!ready)throw Error('container_lookup_timeout');
   if(field('soc-0').checked)throw Error('shipper_owned_unsupported');
   setValue(field('vgm-0'),p.vgmKg);setValue(field('name-0'),p.signature);setValue(field('method-0'),p.method);setValue(field('certificate-0'),p.certificate);
   await delay(500);
   const expected={'booking-0':p.booking,'number-0':p.container,'vgm-0':p.vgmKg,'name-0':p.signature,'method-0':p.method,'certificate-0':p.certificate};
   for(const [id,value] of Object.entries(expected))if(field(id).value!==value)throw Error('field_mismatch');
   if(!unit.checked)throw Error('unit_mismatch');
   const errors=[...document.querySelectorAll('.field-validation-error,.validation-summary-errors,.input-validation-error')].filter(visible);
   if(errors.length)throw Error('carrier_validation');
   const form=field('vgmform-0');if(!form.checkValidity())throw Error('carrier_required_fields');
   await delay(1000);
   for(const [id,value] of Object.entries(expected))if(field(id).value!==value)throw Error('field_mismatch');
   prepared=JSON.stringify(p);return {state:'prepared',accountVerified:false};
  }
  if(message.action==='cbi-cma-submit'){
   if(clicked||!prepared||prepared!==JSON.stringify(message.payload))throw Error('not_prepared');
   const p=message.payload,expected={'booking-0':p.booking,'number-0':p.container,'vgm-0':p.vgmKg,'name-0':p.signature,'method-0':p.method,'certificate-0':p.certificate};
   for(const [id,value] of Object.entries(expected))if(field(id).value!==value)throw Error('field_mismatch');
   if(!document.querySelector('input[name=unit][value="1"]')?.checked)throw Error('unit_mismatch');
   const buttons=[...document.querySelectorAll('[data-ko="submitVgm"]')].filter(visible);
   if(buttons.length!==1||buttons[0].disabled)throw Error('submit_unavailable');
   clicked=true;buttons[0].click();return {state:'clicked'};
  }
  return {state:'unsupported'};
 })().then(respond).catch(e=>respond({state:'blocked',message:/^[a-z_]+$/.test(e.message)?e.message:'form_unavailable'}));return true;
});

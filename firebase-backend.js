import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {getAuth,setPersistence,browserSessionPersistence,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,updateProfile} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {getFirestore,collection,doc,getDocs,getDoc,setDoc,updateDoc,deleteDoc,runTransaction,writeBatch} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
const app=initializeApp({"apiKey": "AIzaSyAsMliQuvAnF9MRUbfl5B1K207ys4NpYw0", "authDomain": "ironbook-41fb6.firebaseapp.com", "projectId": "ironbook-41fb6", "storageBucket": "ironbook-41fb6.firebasestorage.app", "messagingSenderId": "110718000745", "appId": "1:110718000745:web:83e9759ff1e78870008cf8"}),auth=getAuth(app),db=getFirestore(app),appId="ironbook";
await setPersistence(auth,browserSessionPersistence);
const allowed=new Set(appId==='ironbook'?['members','plans','payments','checkins','settings']:['students','batches','payments','attendance','settings']);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const ref=(c,id)=>{if(!auth.currentUser)throw Error('Please log in first.');return doc(db,'owners',auth.currentUser.uid,'apps',appId,c,String(id))};
const col=c=>collection(db,'owners',auth.currentUser.uid,'apps',appId,c);
const clean=x=>JSON.parse(JSON.stringify(x));
const response=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
function money(x){const n=Number(x);if(!Number.isFinite(n)||n<0)throw Error('Enter a valid non-negative amount.');return n}
function addMonths(date,months){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid date.');const [y,m,d]=date.split('-').map(Number),v=new Date(y,m-1,d);const target=new Date(y,m-1+Number(months),1);target.setDate(Math.min(d,new Date(target.getFullYear(),target.getMonth()+1,0).getDate()));target.setDate(target.getDate()-1);return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`}
async function nextId(tx,count=1){const r=ref('_meta','ids'),s=await tx.get(r),n=(s.exists()?s.data().next:1);return {r,n,next:n+count}}
async function ensureSettings(data={}){const r=ref('settings',1);await runTransaction(db,async tx=>{const s=await tx.get(r);if(!s.exists())tx.set(r,{id:1,[appId==='ironbook'?'gymName':'centreName']:data.orgName||'',ownerName:data.name||auth.currentUser.displayName||'',phone:data.phone||''})})}
async function memberAction(id,data){return runTransaction(db,async tx=>{
 const plan=await tx.get(ref('plans',data.planId));if(!plan.exists())throw Error('Create/select a plan first.');const p=plan.data();if(!Number.isInteger(Number(p.months))||Number(p.months)<1)throw Error('Plan months must be a positive integer.');
 let member,start=data.member?.startDate||today();
 if(id){const s=await tx.get(ref('members',id));if(!s.exists())throw Error('Member not found.');member=s.data();if(member.endDate>=today()){const d=new Date(member.endDate+'T12:00:00');d.setDate(d.getDate()+1);start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}}
 const ids=await nextId(tx,id?1:2),memberId=id?Number(id):ids.n,paymentId=id?ids.n:ids.n+1;
 const changes={planId:Number(data.planId),startDate:start,endDate:addMonths(start,p.months)};
 const out={...(member||clean(data.member||{})),...changes,id:memberId};
 tx.set(ids.r,{next:ids.next});tx.set(ref('members',memberId),out);
 const amount = money(data.amount);

if (amount > 0) {
  tx.set(ref('payments', paymentId), {
    id: paymentId,
    memberId,
    planId: Number(data.planId),
    amount,
    mode: data.mode || 'UPI',
    paidOn: today(),
    fromDate: start,
    toDate: changes.endDate,
    note: id ? 'Renewal' : 'Joining'
  });
}
 return out;
})}
async function request(method,path,data={}){
 if(path.startsWith('/api/auth/')){
  const action=path.split('/').pop();if(action==='logout'){await signOut(auth);return response({ok:true})}
  if(!['login','signup'].includes(action))throw Error('Unsupported auth operation.');
  if(String(data.email).startsWith('demo@'))throw Error('Shared demo accounts are disabled. Use your own test account.');
  let result;if(action==='signup'){result=await createUserWithEmailAndPassword(auth,String(data.email).trim(),data.password);if(data.name)await updateProfile(result.user,{displayName:data.name})}else result=await signInWithEmailAndPassword(auth,String(data.email).trim(),data.password);
  await ensureSettings(data);return response({token:await result.user.getIdToken(),user:{id:result.user.uid,name:result.user.displayName||'Owner',email:result.user.email}});
 }
 if(!auth.currentUser)throw Error('Please log in first.');
 const parts=path.split('/').filter(Boolean),c=parts[1],id=parts[2];if(parts[0]!=='api'||!allowed.has(c))throw Error('Unsupported data endpoint: '+path);
 if(appId==='ironbook'&&c==='members'&&id==='join'&&method==='POST')return response(await memberAction(null,data));
 if(appId==='ironbook'&&c==='members'&&parts[3]==='renew'&&method==='POST')return response(await memberAction(id,data));
 if(appId==='kalvidesk'&&c==='attendance'&&id==='save'&&method==='POST'){
  if(!data.date||!Array.isArray(data.records)||data.records.length>450)throw Error('Invalid attendance data or batch too large.');
  const batch=writeBatch(db);for(const row of data.records){const key=`${data.batchId}_${data.date}_${row.studentId}`;batch.set(ref(c,key),{id:key,batchId:Number(data.batchId),date:data.date,studentId:Number(row.studentId),present:!!row.present})}await batch.commit();return response({ok:true});
 }
 if(method==='GET'){if(id){const s=await getDoc(ref(c,id));return response(s.exists()?s.data():null)}const s=await getDocs(col(c));return response(s.docs.map(d=>d.data()).sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true})))}
 if(method==='DELETE'){if(!id)throw Error('Missing record ID.');await deleteDoc(ref(c,id));return response({ok:true})}
 const value=clean(data);if('amount'in value)value.amount=money(value.amount);if('monthlyFee'in value)value.monthlyFee=money(value.monthlyFee);if('price'in value)value.price=money(value.price);
 if(c==='payments'&&!value.paidOn)value.paidOn=today();
 if(c==='checkins'){value.date=value.date||today();value.time=value.time||new Date().toTimeString().slice(0,5)}
 if(['PATCH','PUT'].includes(method)){if(!id)throw Error('Missing record ID.');await updateDoc(ref(c,id),value);return response({...value,id:Number(id)||id})}
 if(method==='POST'){
  if(c==='settings'){await setDoc(ref(c,1),{...value,id:1},{merge:true});return response({...value,id:1})}
  const out=await runTransaction(db,async tx=>{const ids=await nextId(tx),out={...value,id:ids.n};tx.set(ids.r,{next:ids.next});tx.set(ref(c,ids.n),out);return out});return response(out);
 }
 throw Error('Unsupported operation.');
}
window.IronFirebase = {
  async request(method, path, data = {}) {
    try {
      return await request(method, path, data);
    } catch (error) {
      console.error("IronBook request failed:", {
        path,
        code: error?.code,
        message: error?.message
      });

      // The existing login/signup screen expects JSON in error.message.
      if (path.startsWith("/api/auth/")) {
        const code = error?.code || "";
        let message = error?.message || "Authentication failed.";

        const messages = {
          "auth/email-already-in-use":
            "This email already has an account. Use Log in instead.",
          "auth/invalid-email":
            "Please enter a valid email address.",
          "auth/weak-password":
            "The password is too weak. Try a longer password.",
          "auth/invalid-credential":
            "The email or password is incorrect.",
          "auth/operation-not-allowed":
            "Email/password sign-in is not enabled for this Firebase project.",
          "auth/too-many-requests":
            "Too many attempts. Please wait before trying again.",
          "auth/network-request-failed":
            "A network error occurred. Check your connection."
        };

        message = messages[code] || message;

        throw new Error(
          JSON.stringify({
            message: code ? `${message} (${code})` : message
          })
        );
      }

      throw error;
    }
  }
};

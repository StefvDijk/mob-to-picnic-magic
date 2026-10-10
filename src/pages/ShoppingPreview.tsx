import { ShoppingLoader } from '@/components/ShoppingLoader';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, ShoppingBasket, UserRound, BookOpen } from 'lucide-react';
import { api, ApiError, type MeDto } from '@/lib/api';
import type { RecipeDto, RecipeIngredientDto, SavedRecipeDto } from '../../shared/recipes';
import type { ImportDto } from '../../shared/imports';
import { recipeInputFromImport } from '@/lib/import-draft';
import { ImportPanel } from '@/components/ImportPanel';
import { RecipeProducts } from '@/components/RecipeProducts';
import { ShoppingIngredientEditor } from '@/components/ShoppingIngredientEditor';
import { PicnicPanel } from '@/components/PicnicPanel';
import { AccountPanel } from '@/components/AccountPanel';
import { AuthPanel } from '@/components/AuthPanel';
import { SavedRecipesPanel } from '@/components/SavedRecipesPanel';

function clearOwnerState(ownerId: string) {
  sessionStorage.removeItem(`picnic:pending-import:${ownerId}:shopping`);
  sessionStorage.removeItem(`picnic:pending-import:${ownerId}:shopping-preview`);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(`picnic:shopping:${ownerId}:`) && !key.endsWith(':purchase') && !key.endsWith(':round')) localStorage.removeItem(key);
  }
}

export default function ShoppingPreview({ preview = false }: { preview?: boolean }) {
  const basePath = preview ? '/preview' : '';
  const draftScope = preview ? ':shopping-preview' : ':shopping';
  useEffect(() => {
    const previous = document.title;
    document.title = preview ? 'Boodschappen · Preview' : 'Boodschappen · Picnic';
    return () => { document.title = previous; };
  }, [preview]);
  const navigate = useNavigate();
  const location = useLocation();
  const { recipeId } = useParams();
  const [me, setMe] = useState<MeDto | null>(null);
  const [selected, setSelected] = useState<RecipeDto | null>(null);
  const [sources, setSources] = useState<RecipeIngredientDto[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const ownerId = me?.account.id;
  const ownerRef = useRef<string | undefined>(undefined);
  const section = location.pathname.endsWith('/picnic') ? 'picnic' : location.pathname.endsWith('/account') ? 'account' : location.pathname.endsWith('/recepten') ? 'recipes' : 'shopping';
  const authExpired = useCallback(() => { if (ownerRef.current) clearOwnerState(ownerRef.current); ownerRef.current=undefined; setMe(null); setSelected(null); setSources(null); setError('Je sessie is verlopen. Log opnieuw in om verder te gaan.'); }, []);
  const refreshMe = useCallback(async () => {
    try {
      const next = await api.me();
      if (ownerRef.current && ownerRef.current !== next.account.id) { clearOwnerState(ownerRef.current); setSelected(null); setSources(null); }
      ownerRef.current = next.account.id;
      setMe(next); setError('');
    }
    catch(cause) { if (cause instanceof ApiError && cause.status===401) { if(ownerRef.current)clearOwnerState(ownerRef.current);ownerRef.current=undefined;setMe(null); setSelected(null); setSources(null); } else setError(cause instanceof Error ? cause.message : 'Verbinden is niet gelukt.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(()=>{ void refreshMe(); },[refreshMe]);
  useEffect(()=>{if(ownerId&&ownerRef.current&&ownerRef.current!==ownerId)clearOwnerState(ownerRef.current);ownerRef.current=ownerId;},[ownerId]);
  useEffect(()=>{
    if(!ownerId||!recipeId||selected?.id===recipeId)return;
    let active=true;setError('');
    void api.getRecipe(recipeId).then(result=>{if(active)setSelected(result.recipe);}).catch(cause=>{if(!active)return;if(cause instanceof ApiError&&cause.status===401)authExpired();else setError(cause instanceof Error?cause.message:'Je boodschappen zijn niet geladen.');});
    return()=>{active=false;};
  },[ownerId,recipeId,selected?.id,authExpired,retry]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});document.getElementById('sp-main')?.focus({preventScroll:true});},[location.pathname]);
  async function useCandidate(source: ImportDto, index: number, servings: string, baseServings?: string, clientDeadlineAt?: number) {
    const candidate=source.candidates[index];if(!candidate)return;
    const input=recipeInputFromImport(source,candidate);
    const {recipe}=await api.createRecipe({...input,...(baseServings?{baseServings}:{}),importSource:{importId:source.id,candidateIndex:index},autoSave:true});
    setSelected(recipe);sessionStorage.removeItem(`picnic:pending-import:${me!.account.id}${draftScope}`);
    navigate(`${basePath}/boodschappen/${encodeURIComponent(recipe.id)}`,{state:{servings,initialDeadlineAt:source.deadlineAt&&source.deadlineAt>Date.now()?source.deadlineAt:undefined,clientDeadlineAt}});
  }
  function home(){navigate(basePath || '/');setError('');setSources(null);}
  if(loading)return <main className="sp-app sp-starting"><ShoppingLoader message="Je boodschappen laden…"/></main>;
  if(!me)return <main className="sp-app sp-login"><div className="sp-logo"><span className="sp-logo-mark"><img src="/favicon-picnic.png" alt="" width="30" height="30"/></span><span>Mand</span></div>{error&&<p role="alert" className="sp-error">{error}</p>}<AuthPanel onAuthenticated={refreshMe}/></main>;
  return <div className="sp-app">
    <a className="skip-link" href="#sp-main">Ga naar inhoud</a>
    <header className="sp-app-header"><div className="sp-header-inner"><button className="sp-logo" onClick={home} aria-label="Naar Mand"><span className="sp-logo-mark"><img src="/favicon-picnic.png" alt="" width="30" height="30"/></span><span>Mand</span>{preview && <span className="sp-preview-label">Preview</span>}</button>
      <nav className="sp-nav" aria-label="Hoofdnavigatie"><button aria-current={section==='shopping'?'page':undefined} onClick={home}><ShoppingBasket size={18}/>Mand</button><button aria-current={section==='recipes'?'page':undefined} onClick={()=>navigate(`${basePath}/recepten`)}><BookOpen size={18}/>Recepten</button><button aria-current={section==='picnic'?'page':undefined} onClick={()=>navigate(`${basePath}/picnic`)}><img className="sp-picnic-logo" src="/favicon-picnic.png" alt="" width="22" height="22"/>Picnic</button><button aria-current={section==='account'?'page':undefined} onClick={()=>navigate(`${basePath}/account`)}><UserRound size={18}/>Account</button></nav>
      <button className="sp-connection" onClick={()=>navigate(`${basePath}/picnic`)}><span className={me.picnic.status==='connected'?'sp-connected':''}/>{me.picnic.status==='connected'?'Picnic verbonden':'Verbind Picnic'}<ArrowUpRight size={14}/></button>
    </div></header>
    {me.environment==='test'&&<div className="sp-demo-note">Lokale preview met testgegevens · er gaan geen producten naar je echte mandje</div>}
    <main id="sp-main" className="sp-main" tabIndex={-1}>
      {error&&section!=='recipes'&&<div className="sp-error" role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>Opnieuw proberen</button></div>}
      {section==='picnic'&&<section className="sp-settings"><h1>Jouw Picnic</h1><p>Je koppeling en je huidige mandje.</p><PicnicPanel me={me} onRefresh={refreshMe}/></section>}
      {section==='account'&&<section className="sp-settings"><h1>Account</h1><AccountPanel me={me} onRefresh={refreshMe} onSignedOut={()=>{clearOwnerState(me.account.id);ownerRef.current=undefined;setMe(null);setSelected(null);setSources(null);home();}} onOpenAdmin={()=>navigate('/beheer')}/></section>}
      {section==='recipes'&&<section className="sp-settings"><SavedRecipesPanel ownerId={me.account.id} onAuthExpired={authExpired} onReview={(recipe:SavedRecipeDto)=>navigate(`${basePath}/boodschappen/${encodeURIComponent(recipe.recipeId)}`,{state:{servings:recipe.servings,rememberedSelection:recipe}})}/></section>}
      {section==='shopping'&&recipeId&&(selected?.id===recipeId ? <RecipeProducts key={`${selected.id}:${selected.version}`} recipe={selected} ownerId={me.account.id} initialServings={location.state?.servings} initialDeadlineAt={location.state?.initialDeadlineAt} clientDeadlineAt={location.state?.clientDeadlineAt} initialSavedSelection={location.state?.rememberedSelection as SavedRecipeDto|undefined} compact onEditIngredient={setSources} onBack={home} onAuthExpired={authExpired}/> : !error&&<div className="sp-starting"><ShoppingLoader message="Boodschappen ophalen…"/></div>)}
      {section==='shopping'&&!recipeId&&<section className="sp-new-shopping"><ImportPanel ownerId={`${me.account.id}${draftScope}`} shoppingOnly onAuthExpired={authExpired} onUseCandidate={useCandidate} onClose={home}/></section>}
    </main>
    {sources&&selected&&<ShoppingIngredientEditor recipe={selected} sources={sources} onClose={()=>setSources(null)} onSaved={setSelected} onAuthExpired={authExpired}/>}
  </div>;
}

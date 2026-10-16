import asyncio,json,os,uuid
from pathlib import Path
from playwright.async_api import async_playwright
D=Path('/tmp/browser/dossier'); now='2026-10-16T12:10:03Z'; oid='532cd40f-cc48-45c1-86d4-2086d68df418'; cid='60e92da1-4ee6-4123-ae02-4589a6bc330b'; dep='41150507-8650-4654-b799-5840d33686ad'
labels={'einkauf':'Material prüfen und bestellen','werkstatt':'Fertigung starten','versand':'Lieferschein erstellen und versenden','rechnung':'Rechnung erstellen'}
state={'step':0,'role':'admin','manual':False}
def fixtures(table):
 s=state['step']; hand=[]
 for stage,start,end in [('einkauf',1,4),('werkstatt',4,6),('versand',6,7),('rechnung',7,9)]:
  if s>=start: hand.append({'id':stage,'order_id':oid,'stage':stage,'title':labels[stage],'department_id':dep,'status':'done' if s>=end or (state['manual'] and stage=='einkauf') else 'open','created_at':now,'trigger_event':'Isolierter Prüflauf','completed_at':now if s>=end else None,'completed_reason':'Automatisch erledigt' if s>=end else None})
 return {'orders':[{'id':oid,'order_no':'ISOLATED-AUF','customer_name':'Isolierter Testkunde','status':'draft' if s==0 else 'active','created_at':now,'case_id':None if s==10 else cid,'external_order_no':'ISOLATED-OFFER' if s==10 else None}], 'purchase_orders':[{'id':'po1','po_no':'ISOLATED-PO1','status':'draft' if s<2 else 'partial' if s==2 else 'received','created_at':now},{'id':'po2','po_no':'ISOLATED-PO2','status':'draft' if s<4 else 'received','created_at':now}], 'production_orders':[{'id':'wo1','wo_no':'ISOLATED-WO1','status':'draft' if s<5 else 'completed','art_nr':'ISOLATED-ART','quantity':1,'created_at':now},{'id':'wo2','wo_no':'ISOLATED-WO2','status':'draft' if s<6 else 'completed','art_nr':'ISOLATED-ART','quantity':1,'created_at':now}], 'deliveries':[{'id':'ls','delivery_no':'ISOLATED-LS','status':'draft' if s<7 else 'shipped','created_at':now}], 'invoices':([] if s<8 else [{'id':'credit','invoice_no':'ISOLATED-CREDIT','doc_kind':'credit_note','status':'draft','created_at':now,'total_amount':10}])+([] if s<9 else [{'id':'invoice','invoice_no':'ISOLATED-INVOICE','doc_kind':'invoice','status':'draft','created_at':now,'total_amount':10}]), 'order_handoffs':hand,'departments':[{'id':dep,'name':'ISOLATED Testbereich'}],'offers':[{'id':'offer','offer_no':'ISOLATED-OFFER','deal_id':'deal','status':'angenommen','created_at':now}] if s==10 else [],'deals':[{'id':'deal','deal_no':'ISOLATED-DEAL','title':'Isolierte Chance','won_at':now,'created_at':now}] if s==10 else []}.get(table,[])
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True); context=await browser.new_context(viewport={'width':1280,'height':1800});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  session=json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']);uid=session['user']['id']
  async def route(r):
   url=r.request.url; table=url.split('/rest/v1/')[1].split('?')[0]
   if table=='user_roles':await r.fulfill(json=[{'role':state['role']}] if 'limit=' not in url else {'role':state['role']});return
   if table not in ['orders','offers','deals','purchase_orders','production_orders','deliveries','invoices','order_handoffs','departments']:await r.continue_();return
   if r.request.method=='PATCH':state['manual']=True;await r.fulfill(status=204,body='');return
   data=fixtures(table)
   await r.fulfill(json=(data[0] if data else None) if 'vnd.pgrst.object' in r.request.headers.get('accept','') else data)
  await context.route('**/rest/v1/**',route)
  await page.goto('http://localhost:8080/auth');await page.evaluate('(v)=>localStorage.setItem(v.key,v.session)',{'key':os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],'session':json.dumps(session)})
  await page.goto('http://localhost:8080/orders/'+oid+'/akte');await page.get_by_text('Vorgangsakte ISOLATED-AUF',exact=True).wait_for(timeout=30000)
  expected=['Vertrieb','Einkauf','Einkauf','Einkauf','Werkstatt','Werkstatt','Versand','Rechnung','Rechnung','Abgeschlossen']
  for i,label in enumerate(expected):
   state['step']=i
   await page.get_by_role('button',name='Aufträge',exact=True).click();await page.evaluate('(url)=>{history.pushState({},"",url);window.dispatchEvent(new PopStateEvent("popstate"));}', '/orders/'+oid+'/akte')
   await page.get_by_text('Vorgangsakte ISOLATED-AUF',exact=True).wait_for();await page.wait_for_timeout(500)
   active=page.locator('ol li.border-primary')
   assert await active.inner_text()==label, (i,await active.inner_text())
   await page.screenshot(path=str(D/f'step-{i}.png'));print('Browser step',i,label,'verified')
  state['step']=10
  await page.get_by_role('button',name='Aufträge',exact=True).click();await page.evaluate('(url)=>{history.pushState({},"",url);window.dispatchEvent(new PopStateEvent("popstate"));}', '/orders/'+oid+'/akte')
  await page.get_by_text('Angebot ISOLATED-OFFER',exact=True).wait_for();await page.get_by_text('Verkaufschance ISOLATED-DEAL gewonnen',exact=True).wait_for();print('CRM offer and deal without case visible');await page.screenshot(path=str(D/'crm-links.png'))
  state.update(step=1,role='staff',manual=False)
  await page.goto('http://localhost:8080/auth');await page.evaluate('(v)=>localStorage.setItem(v.key,v.session)',{'key':os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],'session':json.dumps(session)});await page.goto('http://localhost:8080/orders/'+oid+'/akte');await page.get_by_role('button',name='Als erledigt markieren').wait_for();await page.get_by_role('button',name='Als erledigt markieren').click();await page.get_by_text('Übergabe erledigt',exact=True).wait_for();await page.get_by_role('button',name='Als erledigt markieren').wait_for(state='hidden');await page.screenshot(path=str(D/'staff-completed.png'));print('Staff completion read back in isolated fixture')
  state.update(role='viewer',manual=False)
  await page.goto('http://localhost:8080/auth');await page.evaluate('(v)=>localStorage.setItem(v.key,v.session)',{'key':os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],'session':json.dumps(session)});await page.goto('http://localhost:8080/orders/'+oid+'/akte');await page.get_by_text('Vorgangsakte ISOLATED-AUF',exact=True).wait_for();await page.wait_for_timeout(700);await page.get_by_role('button',name='Als erledigt markieren').wait_for(state='hidden');await page.screenshot(path=str(D/'viewer.png'));print('Viewer sees no completion button')
  print('Runtime errors',errors);assert not errors
  await browser.close()
asyncio.run(main())

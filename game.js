(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, T = 32;
  const world = { w: 40, h: 26 };
  const ui = id => document.getElementById(id);
  const keys = new Set();
  let running = false, inDialogue = false, soundOn = false, last = 0, toastTimer = 0, swingTimer = 0, hurtFlash = 0;
  let camera = {x:0,y:0};
  const player = {x:14*T+16,y:15*T+16,r:10,speed:150,face:'down',hp:100,maxHp:100,mp:40,maxMp:40,xp:0,level:1,attack:0,potions:2,gold:12,herbs:0,invuln:0};
  const quest = {stage:0,kills:0,done:false};
  const defeated = {slime:0,wolf:0};
  let time = 0, dayTime = 8.7;
  const trees = [], herbs = [], enemies = [], decorations = [];
  const tileNoise=(x,y)=>{let n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)};
  const pathAt=(x,y)=>Math.abs(y-13)<1 || (Math.abs(x-14)<1 && y>3&&y<22) || (Math.abs(y-9)<1&&x>18&&x<25) || (Math.abs(x-29)<1&&y>9&&y<14);
  // Forest details are seeded so every visit has the same recognizable valley.
  for(let y=1;y<world.h-1;y++) for(let x=1;x<world.w-1;x++){
    const nearVillage=x>=6&&x<=18&&y>=7&&y<=18;
    if(!nearVillage && !pathAt(x,y) && tileNoise(x,y)>.82 && !(x>=29&&x<=37&&y>=9&&y<=17)) trees.push({x,y,type:tileNoise(x+5,y+9)>.45?'pine':'broad'});
    if(tileNoise(x+19,y+3)>.989 && !pathAt(x,y)) decorations.push({x,y,type:'flower'});
  }
  const herbSpots=[[19,8],[23,11],[20,17],[27,17],[8,20],[31,7]];
  herbSpots.forEach(([x,y],i)=>herbs.push({x:x*T+16,y:y*T+16,taken:false,phase:i}));
  const npc={x:14*T+16,y:10*T+16,name:'Amara'};
  const fire={x:14*T+16,y:12*T+16};
  const cabin={x:9*T,y:8*T,w:4*T,h:3*T};
  const gate={x:31*T+16,y:13*T+16};
  function makeEnemy(kind,x,y){return {kind,x:x*T+16,y:y*T+16,hp:kind==='boss'?220:kind==='wolf'?44:30,max:kind==='boss'?220:kind==='wolf'?44:30,alive:true,phase:Math.random()*7,attackWait:0,hitFlash:0};}
  [[18,14],[21,12],[25,15],[9,19],[27,7],[32,17]].forEach((p,i)=>enemies.push(makeEnemy(i===5?'wolf':'slime',...p)));
  let boss=null;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function solidTile(tx,ty){
    if(tx<1||ty<1||tx>=world.w-1||ty>=world.h-1)return true;
    if(tx>=cabin.x/T-1&&tx<(cabin.x+cabin.w)/T+1&&ty>=cabin.y/T-1&&ty<(cabin.y+cabin.h)/T+1)return true;
    if(tx>=25&&tx<=27&&ty>=19&&ty<=21)return true; // pond
    if(tx>=31&&tx<=32&&ty>=12&&ty<=14&&!gateOpen())return true;
    return trees.some(t=>t.x===tx&&t.y===ty);
  }
  function gateOpen(){return quest.stage>=4;}
  function openRuins(){
    if(quest.stage!==3||quest.kills<5)return;
    quest.stage=4;message('Passagem aberta! Vá até o portão a leste.');journal('A passagem antiga está aberta');setHint('A passagem se abriu. Encontre o Guardião das Cinzas a leste.');updateAll();
  }
  function collides(x,y,r=player.r){
    const corners=[[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]];
    return corners.some(([cx,cy])=>solidTile(Math.floor(cx/T),Math.floor(cy/T)));
  }
  function moveEntity(e,dx,dy,r){
    if(!collides(e.x+dx,e.y,r))e.x+=dx;
    if(!collides(e.x,e.y+dy,r))e.y+=dy;
  }
  function message(text){const el=ui('toast');el.textContent=text;el.classList.add('show');toastTimer=2.2;}
  function journal(text){const row=document.createElement('div');row.className='journal-entry active';row.innerHTML=`<i>✦</i><span>${text}</span><small>AGORA</small>`;ui('journalList').prepend(row);while(ui('journalList').children.length>4)ui('journalList').lastElementChild.remove();}
  function setHint(text){ui('worldHint').textContent=text;}
  const dialogues={
    greeting:['O vale está diferente, Liora. A chama da floresta está enfraquecendo.','As ervas de luz ainda crescem ao norte. Traga três para mim — posso preparar algo que nos ajude.'],
    herbs:['Você encontrou as ervas! A floresta agradece.','Mas as gosmas estão por toda parte. Derrote cinco delas e o caminho para as ruínas ficará livre.'],
    hunt:['As criaturas recuaram... sinto a terra respirar novamente.','A passagem antiga está aberta. Vá até o portão a leste — algo sombrio espera além dele.'],
    complete:['Você voltou, Liora! O vale está seguro, por enquanto.','A chama escolheu bem sua guardiã. Descanse, aventureira — novas lendas ainda virão.'],
    progress:['Continue, Liora. O vale precisa de você.','Cada pequeno passo nos aproxima da luz.']
  };
  let dialogueQueue=[], dialogueIndex=0, dialogueFinish=null;
  function openDialogue(name, lines, finish){
    inDialogue=true;dialogueQueue=lines;dialogueIndex=0;dialogueFinish=finish||null;
    ui('dialogueName').textContent=name;ui('dialogueAvatar').textContent=name==='Amara'?'A':'✦';ui('dialogueText').textContent=lines[0];ui('dialogue').classList.remove('hidden');
  }
  function advanceDialogue(){
    if(!inDialogue)return;
    dialogueIndex++;
    if(dialogueIndex>=dialogueQueue.length){closeDialogue();if(dialogueFinish)dialogueFinish();return;}
    ui('dialogueText').textContent=dialogueQueue[dialogueIndex];
  }
  function closeDialogue(){ui('dialogue').classList.add('hidden');inDialogue=false;}
  ui('dialogueNext').addEventListener('click',advanceDialogue);ui('dialogueClose').addEventListener('click',closeDialogue);
  function interact(){
    if(!running)return;
    if(inDialogue){advanceDialogue();return;}
    if(distance(player,npc)<62){
      if(quest.stage===0){openDialogue('Amara',dialogues.greeting,()=>{quest.stage=player.herbs>=3?2:1;journal('Amara pediu três ervas de luz');updateQuest();setHint(player.herbs>=3?'Leve as ervas de luz para Amara.':'Encontre 3 ervas de luz brilhantes pelo vale.');});}
      else if(quest.stage===1)openDialogue('Amara',dialogues.progress);
      else if(quest.stage===2&&player.herbs>=3){openDialogue('Amara',dialogues.herbs,()=>{player.herbs-=3;quest.stage=3;updateAll();journal('Amara pediu que você derrotasse cinco gosmas');setHint('Derrote 5 gosmas para abrir a passagem antiga.');openRuins();});}
      else if(quest.stage===2)openDialogue('Amara',[`Ainda faltam ervas, querida. Você tem ${player.herbs} de 3.`,...dialogues.progress]);
      else if(quest.stage===3)openDialogue('Amara',['As gosmas ainda ameaçam o vale. Derrote cinco delas para abrir a passagem.','Volte quando a passagem para as ruínas estiver livre.']);
      else if(quest.stage===4)openDialogue('Amara',dialogues.hunt);
      else openDialogue('Amara',dialogues.complete);
      return;
    }
    if(distance(player,gate)<65){
      if(!gateOpen())message('A passagem está selada. Derrote 5 gosmas primeiro.');
      else if(!boss){boss=makeEnemy('boss',35,13);journal('Uma presença antiga despertou nas ruínas');message('O Guardião das Cinzas apareceu!');}
      else message('O Guardião das Cinzas aguarda nas ruínas.');return;
    }
    const herb=herbs.find(h=>!h.taken&&distance(player,{x:h.x,y:h.y})<40);
    if(herb){herb.taken=true;player.herbs++;player.xp+=12;if(quest.stage===1&&player.herbs>=3){quest.stage=2;setHint('Você encontrou as três ervas. Leve-as para Amara.');}message('Erva de luz recolhida · +12 XP');journal('Erva de luz recolhida');updateAll();return;}
    if(distance(player,fire)<55){message('A fogueira aquece o coração.');return;}
    message('Não há nada para interagir por perto.');
  }
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function attack(){
    if(!running||inDialogue||player.attack>0)return;
    player.attack=.32;swingTimer=.22;let range=61, hit=false;
    const fx=player.face==='left'?-1:player.face==='right'?1:0,fy=player.face==='up'?-1:player.face==='down'?1:0;
    const targets=enemies.concat(boss?[boss]:[]).filter(e=>e&&e.alive);
    for(const e of targets){const dx=e.x-player.x,dy=e.y-player.y,dist=Math.hypot(dx,dy);const dot=(dx*fx+dy*fy)/(dist||1);if(dist<range+(e.kind==='boss'?15:0)&&dot>-.05){e.hp-=e.kind==='boss'?24:34;e.hitFlash=.15;hit=true;if(e.hp<=0)defeat(e);}}
    if(hit){player.mp=Math.max(0,player.mp-1);sound('hit');}else sound('swing');updateAll();
  }
  function defeat(e){
    e.alive=false;const xp=e.kind==='boss'?150:e.kind==='wolf'?30:20;player.xp+=xp;player.gold+=e.kind==='boss'?35:e.kind==='wolf'?7:4;
    if(e.kind==='slime'){defeated.slime++;quest.kills++;ui('slimeCount').textContent=defeated.slime;openRuins();}
    if(e.kind==='wolf')ui('wolfCount').textContent=defeated.wolf;
    if(e.kind==='boss'){quest.stage=5;quest.done=true;journal('O Guardião das Cinzas foi derrotado');setHint('Você salvou o Vale de Lúmen!');setTimeout(()=>endGame(true),1200);}
    if(defeated.slime+defeated.wolf===1){ui('achievementTitle').textContent='Primeiro sangue';ui('achievementDesc').textContent='Conquista desbloqueada!';}
    message(`${e.kind==='boss'?'Guardião derrotado':e.kind==='wolf'?'Lobo derrotado':'Gosma derrotada'} · +${xp} XP`);sound('win');updateAll();
  }
  function usePotion(){if(!running)return;if(player.potions<1){message('Você não tem poções.');return;}if(player.hp>=player.maxHp){message('Sua vitalidade já está cheia.');return;}player.potions--;player.hp=Math.min(player.maxHp,player.hp+45);player.mp=Math.min(player.maxMp,player.mp+12);message('Poção usada · vitalidade restaurada');sound('potion');updateAll();}
  ui('potionBtn').addEventListener('click',usePotion);
  function updateQuest(){
    const title=ui('questTitle'),desc=ui('questDesc'),progress=ui('questProgress'),status=ui('questStatus'),bar=ui('questBar');
    const data=[['Um vale em perigo','Fale com a anciã Amara, perto da fogueira.','0 / 1',0],['Ervas para a anciã','Encontre três ervas de luz espalhadas pelo vale.',`${Math.min(player.herbs,3)} / 3`,player.herbs/3],['Ervas para a anciã','Leve as ervas de luz para Amara.',`${Math.min(player.herbs,3)} / 3`,1],['A ameaça das gosmas','Derrote cinco gosmas para abrir a passagem.',`${Math.min(quest.kills,5)} / 5`,quest.kills/5],['O Guardião das Cinzas','Atravesse o portão e derrote o guardião antigo.','PORTÃO ABERTO',1],['A chama restaurada','Você salvou o Vale de Lúmen!','CONCLUÍDA',1]][quest.stage];
    title.textContent=data[0];desc.textContent=data[1];progress.textContent=data[2];bar.style.width=`${Math.min(1,data[3])*100}%`;status.textContent=quest.stage===5?'CONCLUÍDA':quest.stage===0?'NOVA':'EM ANDAMENTO';
  }
  function updateAll(){
    ui('hpText').textContent=`${Math.ceil(player.hp)} / ${player.maxHp}`;ui('hpBar').style.width=`${player.hp/player.maxHp*100}%`;
    ui('mpText').textContent=`${Math.ceil(player.mp)} / ${player.maxMp}`;ui('mpBar').style.width=`${player.mp/player.maxMp*100}%`;
    ui('xpText').textContent=`${player.xp%100} / 100 XP`;ui('xpBar').style.width=`${player.xp%100}%`;ui('level').textContent=String(player.level).padStart(2,'0');
    ui('potionCount').textContent=player.potions;ui('herbCount').textContent=player.herbs;ui('goldCount').textContent=player.gold;updateQuest();
  }
  const tips=['Recolha três ervas de luz e leve-as para Amara, perto da fogueira.','Gosmas são lentas, mas não deixe que elas cerquem você.','Aponte na direção do inimigo e pressione espaço para atacar.','A fogueira marca o coração do vale. Amara está por perto.'];let tipIndex=0;
  ui('tipNext').addEventListener('click',()=>{tipIndex=(tipIndex+1)%tips.length;ui('tipText').textContent=tips[tipIndex];});
  function sound(type){if(!soundOn)return;try{const AC=window.AudioContext||window.webkitAudioContext;const c=new AC(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type=type==='hit'?'square':'sine';o.frequency.value=type==='hit'?180:type==='win'?520:type==='potion'?670:280;g.gain.setValueAtTime(.035,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.12);o.start();o.stop(c.currentTime+.13);}catch(e){}}
  ui('soundBtn').addEventListener('click',()=>{soundOn=!soundOn;ui('soundBtn').style.color=soundOn?'#e1c276':'#c3b28d';message(soundOn?'Sons ativados':'Sons desativados');});
  ui('startBtn').addEventListener('click',()=>{running=true;ui('startScreen').classList.add('hidden');message('A jornada começou, Liora.');});
  ui('restartBtn').addEventListener('click',()=>location.reload());
  function endGame(win){running=false;ui('endTitle').textContent=win?'A chama renasce':'A chama se apaga';ui('endText').textContent=win?`Você derrotou o Guardião das Cinzas e salvou o Vale de Lúmen. Liora alcançou o nível ${player.level}. Uma nova lenda começa.`:'Liora caiu em batalha, mas toda lenda merece uma segunda chance.';ui('gameOver').classList.remove('hidden');}
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k==='e'||k==='enter'){if(!keys.has(k))interact();}if(k===' '){if(!keys.has(k))attack();}if(k==='q'){if(!keys.has(k))usePotion();}keys.add(k);});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
  const touchDirs={};document.querySelectorAll('[data-dir]').forEach(btn=>{const dir=btn.dataset.dir;const on=e=>{e.preventDefault();touchDirs[dir]=true;};const off=e=>{e.preventDefault();touchDirs[dir]=false;};btn.addEventListener('pointerdown',on);['pointerup','pointercancel','pointerleave'].forEach(n=>btn.addEventListener(n,off));});
  ui('touchAttack').addEventListener('pointerdown',e=>{e.preventDefault();attack();});ui('touchInteract').addEventListener('pointerdown',e=>{e.preventDefault();interact();});
  function update(dt){
    time+=dt;if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui('toast').classList.remove('show');}if(swingTimer>0)swingTimer-=dt;if(player.attack>0)player.attack=Math.max(0,player.attack-dt);if(player.invuln>0)player.invuln-=dt;if(hurtFlash>0)hurtFlash-=dt;
    if(!running||inDialogue)return;
    dayTime=(dayTime+dt*.004)%24;const hour=Math.floor(dayTime),mins=Math.floor((dayTime-hour)*60);ui('clock').textContent=`${String(hour%12||12).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;ui('dayLabel').innerHTML=`DIA 01 <i>•</i> ${hour<11?'MANHÃ':hour<17?'TARDE':'NOITE'}`;
    let dx=0,dy=0;if(keys.has('w')||keys.has('arrowup')||touchDirs.up)dy--;if(keys.has('s')||keys.has('arrowdown')||touchDirs.down)dy++;if(keys.has('a')||keys.has('arrowleft')||touchDirs.left)dx--;if(keys.has('d')||keys.has('arrowright')||touchDirs.right)dx++;
    if(dx||dy){let len=Math.hypot(dx,dy);dx/=len;dy/=len;if(Math.abs(dx)>Math.abs(dy))player.face=dx>0?'right':'left';else player.face=dy>0?'down':'up';moveEntity(player,dx*player.speed*dt,dy*player.speed*dt);}
    for(const h of herbs){if(!h.taken&&distance(player,h)<23){h.taken=true;player.herbs++;player.xp+=12;if(quest.stage===1&&player.herbs>=3){quest.stage=2;setHint('Você encontrou as três ervas. Leve-as para Amara.');}message('Erva de luz recolhida · +12 XP');journal('Erva de luz recolhida');updateAll();}}
    for(const e of enemies.concat(boss?[boss]:[])){
      if(!e||!e.alive)continue;e.phase+=dt;e.hitFlash=Math.max(0,e.hitFlash-dt);e.attackWait=Math.max(0,e.attackWait-dt);
      const d=distance(player,e);if(d<215){if(d>27){const speed=e.kind==='boss'?46:e.kind==='wolf'?54:35;moveEntity(e,(player.x-e.x)/d*speed*dt,(player.y-e.y)/d*speed*dt,10);}else if(e.attackWait<=0&&player.invuln<=0){player.hp-=e.kind==='boss'?18:e.kind==='wolf'?12:8;player.invuln=.8;e.attackWait=1.1;hurtFlash=.18;message(e.kind==='boss'?'O Guardião atingiu você!':'Você foi atingida!');sound('hit');if(player.hp<=0){player.hp=0;updateAll();endGame(false);}}}
    }
    if(player.xp>=player.level*100){player.xp-=player.level*100;player.level++;player.maxHp+=12;player.hp=player.maxHp;player.maxMp+=5;player.mp=player.maxMp;message(`Nível ${player.level}! Vitalidade restaurada.`);journal(`Liora alcançou o nível ${player.level}`);updateAll();}
    camera.x=clamp(player.x-W/2,0,world.w*T-W);camera.y=clamp(player.y-H/2,0,world.h*T-H);
  }
  function tile(x,y){const n=tileNoise(x,y);let color=n>.76?'#557a4f':n>.46?'#4f744c':'#52764c';if(pathAt(x,y))color=n>.6?'#9b8e63':'#92865e';if(x>=25&&x<=27&&y>=19&&y<=21)color=n>.6?'#547c7c':'#4c7477';return color;}
  function drawWorld(){
    ctx.clearRect(0,0,W,H);const ox=Math.floor(camera.x/T),oy=Math.floor(camera.y/T),endX=Math.ceil((camera.x+W)/T)+1,endY=Math.ceil((camera.y+H)/T)+1;
    for(let y=oy;y<endY;y++)for(let x=ox;x<endX;x++){
      const sx=x*T-camera.x,sy=y*T-camera.y;ctx.fillStyle=tile(x,y);ctx.fillRect(sx,sy,T,T);
      const n=tileNoise(x+12,y+31);if(!pathAt(x,y)&&!(x>=25&&x<=27&&y>=19&&y<=21)){ctx.fillStyle=n>.5?'#b7c58325':'#243c2b21';ctx.fillRect(sx+4+(n*15|0),sy+5+(tileNoise(x+8,y)*18|0),2,3);if(n>.86){ctx.fillStyle='#dfd69a88';ctx.fillRect(sx+21,sy+22,2,2);}}
      if(x%2===0&&y%2===0){ctx.strokeStyle='#253d2b12';ctx.strokeRect(sx,sy,T,T);}
    }
    // Pond ripples
    for(let i=0;i<4;i++){const px=26*T-camera.x+(i%2)*18+4,py=20*T-camera.y+(i>>1)*17+8;ctx.fillStyle='#a5d0ba55';ctx.fillRect(px,py,8,2);}
    // cabin
    const cx=cabin.x-camera.x,cy=cabin.y-camera.y;ctx.fillStyle='#354339';ctx.fillRect(cx-6,cy+21,cabin.w+12,cabin.h-3);ctx.fillStyle='#68533a';ctx.fillRect(cx+4,cy+27,cabin.w-8,cabin.h-8);ctx.fillStyle='#594432';ctx.beginPath();ctx.moveTo(cx-10,cy+27);ctx.lineTo(cx+cabin.w/2,cy-8);ctx.lineTo(cx+cabin.w+10,cy+27);ctx.closePath();ctx.fill();ctx.fillStyle='#94764b';ctx.fillRect(cx+36,cy+47,25,22);ctx.fillStyle='#cfb37a';ctx.fillRect(cx+45,cy+55,8,14);ctx.fillStyle='#b8c2a0';ctx.fillRect(cx+13,cy+36,14,12);ctx.fillRect(cx+97,cy+36,14,12);
    // path props and old gate
    const gx=gate.x-camera.x,gy=gate.y-camera.y;ctx.fillStyle='#594b36';ctx.fillRect(gx-22,gy-40,8,80);ctx.fillRect(gx+14,gy-40,8,80);ctx.fillStyle=gateOpen()?'#9e8c60':'#67573f';ctx.fillRect(gx-14,gy-37,28,5);if(!gateOpen()){ctx.strokeStyle='#b3965c';ctx.lineWidth=3;for(let i=-1;i<=1;i++)ctx.beginPath(),ctx.moveTo(gx+i*10,gy-33),ctx.lineTo(gx+i*10,gy+35),ctx.stroke();}else{ctx.fillStyle='#d5bc7b33';ctx.fillRect(gx-13,gy-32,26,65);}ctx.lineWidth=1;
    // decor flowers
    for(const d of decorations){const x=d.x*T-camera.x,y=d.y*T-camera.y;ctx.fillStyle='#d4c082';ctx.fillRect(x+12,y+12,3,3);}
    // herbs
    herbs.forEach(h=>{if(h.taken)return;const x=h.x-camera.x,y=h.y-camera.y,bob=Math.sin(time*3+h.phase)*2;ctx.fillStyle='#273e27';ctx.fillRect(x-7,y+6,14,3);ctx.fillStyle='#90b47d';ctx.fillRect(x-2,y-2+bob,4,10);ctx.fillRect(x-8,y-7+bob,7,5);ctx.fillRect(x+2,y-10+bob,7,5);ctx.fillStyle='#e7d996';ctx.fillRect(x-1,y-12+bob,4,4);ctx.fillStyle='#e8d59044';ctx.beginPath();ctx.arc(x,y-3+bob,13+Math.sin(time*3+h.phase)*2,0,Math.PI*2);ctx.fill();});
    // campfire
    const fx=fire.x-camera.x,fy=fire.y-camera.y;ctx.fillStyle='#43372a';ctx.fillRect(fx-18,fy+8,36,8);ctx.fillStyle='#6d4c2b';ctx.fillRect(fx-11,fy+2,23,5);ctx.fillStyle='#ef9f4f';ctx.fillRect(fx-6,fy-7+Math.sin(time*8)*2,12,13);ctx.fillStyle='#ffe49a';ctx.fillRect(fx-3,fy-5+Math.sin(time*8)*2,6,9);ctx.fillStyle='#f1c76b2a';ctx.beginPath();ctx.arc(fx,fy,27+Math.sin(time*4)*3,0,Math.PI*2);ctx.fill();
    // trees draw over ground, sorted for depth
    trees.filter(t=>t.x>=ox-1&&t.x<=endX&&t.y>=oy-2&&t.y<=endY).sort((a,b)=>a.y-b.y).forEach(t=>drawTree(t));
    // npc and monsters
    drawNPC(npc);enemies.forEach(e=>{if(e.alive)drawEnemy(e);});if(boss&&boss.alive)drawEnemy(boss);drawPlayer();
    // soft forest edge shade
    const grd=ctx.createRadialGradient(W/2,H/2,120,W/2,H/2,Math.max(W,H)*.77);grd.addColorStop(0,'#00000000');grd.addColorStop(1,'#0a1a165e');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
  }
  function drawTree(t){const x=t.x*T+16-camera.x,y=t.y*T+26-camera.y;if(x<-40||x>W+40||y<-70||y>H+55)return;ctx.fillStyle='#1c3025';ctx.fillRect(x-4,y-8,9,16);if(t.type==='pine'){ctx.fillStyle='#294732';ctx.beginPath();ctx.moveTo(x,y-51);ctx.lineTo(x-20,y-12);ctx.lineTo(x+20,y-12);ctx.fill();ctx.fillStyle='#38583a';ctx.beginPath();ctx.moveTo(x,y-39);ctx.lineTo(x-17,y-5);ctx.lineTo(x+17,y-5);ctx.fill();ctx.fillStyle='#5e7948';ctx.fillRect(x-2,y-43,4,9);}else{ctx.fillStyle='#36543a';ctx.beginPath();ctx.arc(x,y-24,18,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x-11,y-15,13,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+12,y-15,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4b6842';ctx.fillRect(x-8,y-35,9,4);}ctx.fillStyle='#111f1c33';ctx.fillRect(x-17,y-3,34,4);}
  function drawNPC(n){const x=n.x-camera.x,y=n.y-camera.y;drawShadow(x,y);ctx.fillStyle='#252a27';ctx.fillRect(x-9,y-14,18,21);ctx.fillStyle='#78815e';ctx.fillRect(x-9,y-12,18,16);ctx.fillStyle='#d2b990';ctx.fillRect(x-7,y-23,14,12);ctx.fillStyle='#eee1c6';ctx.fillRect(x-9,y-25,18,5);ctx.fillStyle='#c9a974';ctx.fillRect(x-11,y-20,4,5);ctx.fillStyle='#65583f';ctx.fillRect(x-7,y+5,5,7);ctx.fillRect(x+2,y+5,5,7);ctx.fillStyle='#f2d89a';ctx.fillRect(x-2,y-18,2,2);if(distance(player,n)<92){tag(x,y-38,'Amara','rgba(32,43,35,.88)');}}
  function drawEnemy(e){const x=e.x-camera.x,y=e.y-camera.y;drawShadow(x,y);const hurt=e.hitFlash>0;ctx.save();if(hurt)ctx.globalAlpha=.55+.45*Math.sin(time*45);if(e.kind==='slime'){const bounce=Math.sin(e.phase*4)*2;ctx.fillStyle='#3d6c42';ctx.beginPath();ctx.ellipse(x,y-4+bounce,12,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#82b96e';ctx.beginPath();ctx.ellipse(x,y-7+bounce,9,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e9e9c2';ctx.fillRect(x-4,y-8+bounce,3,3);ctx.fillRect(x+3,y-8+bounce,3,3);ctx.fillStyle='#31432f';ctx.fillRect(x-3,y-7+bounce,1,2);ctx.fillRect(x+4,y-7+bounce,1,2);}
    else if(e.kind==='wolf'){ctx.fillStyle='#495454';ctx.fillRect(x-13,y-8,26,14);ctx.fillStyle='#687575';ctx.fillRect(x-9,y-14,18,11);ctx.fillStyle='#88948e';ctx.fillRect(x-8,y-19,5,8);ctx.fillRect(x+3,y-19,5,8);ctx.fillStyle='#dbc779';ctx.fillRect(x-5,y-11,2,2);ctx.fillRect(x+4,y-11,2,2);ctx.fillStyle='#364140';ctx.fillRect(x-9,y+5,5,5);ctx.fillRect(x+5,y+5,5,5);}
    else{ctx.fillStyle='#44382e';ctx.beginPath();ctx.ellipse(x,y-10,22,25,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#5e4734';ctx.beginPath();ctx.arc(x,y-25,15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#776041';ctx.fillRect(x-17,y-42,8,17);ctx.fillRect(x+9,y-42,8,17);ctx.fillStyle='#ed6d48';ctx.fillRect(x-8,y-29,5,4);ctx.fillRect(x+4,y-29,5,4);ctx.fillStyle='#b77244';ctx.fillRect(x-25,y-3,11,8);ctx.fillRect(x+14,y-3,11,8);ctx.fillStyle='#c89858';ctx.fillRect(x-10,y+11,8,9);ctx.fillRect(x+3,y+11,8,9);}
    ctx.restore();if(e.kind==='boss'){tag(x,y-55,'GUARDIÃO DAS CINZAS','#34271fe8');ctx.fillStyle='#1d2827';ctx.fillRect(x-25,y-47,50,4);ctx.fillStyle='#c45d47';ctx.fillRect(x-25,y-47,50*e.hp/e.max,4);}else if(e.hp<e.max){ctx.fillStyle='#18221f';ctx.fillRect(x-12,y-22,24,3);ctx.fillStyle='#bf7262';ctx.fillRect(x-12,y-22,24*e.hp/e.max,3);}}
  function drawPlayer(){const x=player.x-camera.x,y=player.y-camera.y;drawShadow(x,y);ctx.save();if(player.invuln>0&&Math.floor(time*18)%2)ctx.globalAlpha=.45;const bob=(keys.size>0&&running)?Math.sin(time*13)*1.5:0;ctx.fillStyle='#403b32';ctx.fillRect(x-9,y-10+bob,18,18);ctx.fillStyle='#71806b';ctx.fillRect(x-8,y-12+bob,16,15);ctx.fillStyle='#d5b990';ctx.fillRect(x-7,y-22+bob,14,12);ctx.fillStyle='#483c31';ctx.fillRect(x-8,y-23+bob,16,5);ctx.fillStyle='#e4cfaa';ctx.fillRect(x-7,y-26+bob,12,4);ctx.fillStyle='#3e3931';ctx.fillRect(x-7,y+4+bob,5,8);ctx.fillRect(x+2,y+4+bob,5,8);ctx.fillStyle='#a9895a';if(player.face==='left')ctx.fillRect(x-13,y-10+bob,3,12);else if(player.face==='right')ctx.fillRect(x+10,y-10+bob,3,12);else ctx.fillRect(x+6,y-9+bob,3,12);if(swingTimer>0){ctx.strokeStyle='#f2dda0';ctx.lineWidth=3;ctx.beginPath();const a=player.face==='right'?-.8:player.face==='left'?Math.PI-.8:player.face==='up'?-2.3:.3;ctx.arc(x,y-4,34,a,a+1.1);ctx.stroke();ctx.lineWidth=1;}ctx.restore();}
  function drawShadow(x,y){ctx.fillStyle='#17231f66';ctx.beginPath();ctx.ellipse(x,y+9,13,5,0,0,Math.PI*2);ctx.fill();}
  function tag(x,y,text,color){ctx.font='9px "DM Mono",monospace';const w=ctx.measureText(text).width+14;ctx.fillStyle=color;ctx.fillRect(x-w/2,y-10,w,14);ctx.fillStyle='#eee5cd';ctx.textAlign='center';ctx.fillText(text,x,y);ctx.textAlign='left';}
  function render(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;update(dt);drawWorld();requestAnimationFrame(render);}
  updateAll();requestAnimationFrame(render);
})();

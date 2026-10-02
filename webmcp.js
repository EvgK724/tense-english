export function registerLearningTools({readProgress,openLesson,lessonIds}) {
 const context=document.modelContext;
 if(!context?.registerTool)return;
 const lifecycle=new AbortController();
 const specs=[{
  name:'tense_read_learning_progress',title:'Прогресс Tense',description:'Read aggregate progress and due-card count on this device. Does not change progress.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw Error('No arguments are accepted.');return readProgress();}
 },{
  name:'tense_open_lesson',title:'Открыть урок Tense',description:'Open a tense lesson in the visible interface. This marks the lesson as visited; it does not answer or grade exercises.',inputSchema:{type:'object',properties:{lessonId:{type:'string',enum:lessonIds}},required:['lessonId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='lessonId')||!lessonIds.includes(input.lessonId))throw Error('Unknown lesson.');openLesson(input.lessonId);return {openedLesson:input.lessonId};}
 }];
 for(const tool of specs){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch(_){} }
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

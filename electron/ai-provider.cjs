const DEFAULTS={
  openai:{name:'OpenAI',baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini',visionModel:'gpt-4.1-mini'},
  deepseek:{name:'DeepSeek',baseUrl:'https://api.deepseek.com/v1',model:'deepseek-chat',visionModel:''},
};

const cleanUrl=value=>String(value||'').trim().replace(/\/+$/,'');
const redact=value=>String(value||'').replace(/(sk-[a-z0-9_-]{6})[a-z0-9_-]+/gi,'$1…');
const parseJson=value=>{try{return JSON.parse(value)}catch{const match=String(value).match(/\{[\s\S]*\}/);if(!match)throw new Error('模型没有返回有效 JSON');return JSON.parse(match[0])}};

class OpenAICompatibleProvider{
  constructor(config,{fetchImpl=globalThis.fetch}={}){this.config=config;this.fetch=fetchImpl}
  async request(messages,{model,temperature,responseFormat='json_object',signal}={}){
    if(!this.config.apiKey)throw new Error('请先填写 API Key');
    if(!cleanUrl(this.config.baseUrl))throw new Error('Base URL 不能为空');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Math.max(1000,Number(this.config.timeout)||60000));
    signal?.addEventListener('abort',()=>controller.abort(),{once:true});
    try{
      const body={model:model||this.config.model,messages,temperature:Number.isFinite(Number(temperature))?Number(temperature):Number(this.config.temperature??0.2)};
      if(responseFormat)body.response_format={type:responseFormat};
      const response=await this.fetch(`${cleanUrl(this.config.baseUrl)}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.config.apiKey}`},body:JSON.stringify(body),signal:controller.signal});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(redact(payload?.error?.message||`API 请求失败 (${response.status})`));
      return {text:String(payload?.choices?.[0]?.message?.content||''),usage:payload?.usage||null,model:payload?.model||body.model,raw:payload};
    }catch(error){if(error.name==='AbortError')throw new Error('AI 请求超时或已取消');throw new Error(redact(error.message))}finally{clearTimeout(timeout)}
  }
  async chat(options){return this.request(options.messages,options)}
  async analyzeImage({prompt,imageDataUrl,schema,signal}){const messages=[{role:'system',content:'你是专业影视素材管理员。严格返回 JSON，不要返回 Markdown。'},{role:'user',content:[{type:'text',text:`${prompt}\nJSON 字段要求：${JSON.stringify(schema)}`},{type:'image_url',image_url:{url:imageDataUrl,detail:'low'}}]}];const result=await this.request(messages,{model:this.config.visionModel||this.config.model,signal});return {...result,json:parseJson(result.text)}}
  async testConnection(){const result=await this.request([{role:'user',content:'Reply with OK only.'}],{responseFormat:null,temperature:0});return {ok:true,model:result.model}}
  async listModels(){return [this.config.model,this.config.visionModel].filter(Boolean)}
}

class AIProviderRouter{
  constructor(configs={},options={}){this.configs=configs;this.options=options}
  get(id){const config=this.configs[id];if(!config)throw new Error('AI 服务不存在');if(config.type==='ollama')return new OpenAICompatibleProvider({...config,apiKey:config.apiKey||'ollama'},this.options);return new OpenAICompatibleProvider(config,this.options)}
}

function normalizeProvider(input={}){const type=['openai','deepseek','compatible','ollama'].includes(input.type)?input.type:'compatible',fallback=DEFAULTS[type]||{};return{id:String(input.id||type),type,name:String(input.name||fallback.name||'自定义服务').slice(0,60),baseUrl:cleanUrl(input.baseUrl||fallback.baseUrl),model:String(input.model||fallback.model||''),visionModel:String(input.visionModel||fallback.visionModel||''),temperature:Math.max(0,Math.min(2,Number(input.temperature??0.2))),timeout:Math.max(1000,Math.min(300000,Number(input.timeout)||60000)),enabled:input.enabled!==false}}

module.exports={AIProviderRouter,OpenAICompatibleProvider,normalizeProvider,parseJson,redact};

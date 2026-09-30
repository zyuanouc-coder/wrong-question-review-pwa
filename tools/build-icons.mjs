import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const svg=await readFile(new URL('../icons/icon.svg',import.meta.url),'utf8');
  await mkdir(new URL('../icons/',import.meta.url),{recursive:true});
  for(const size of [180,192,512]){
    const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
    await page.setContent(`<style>html,body{margin:0;background:#254d42}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({path:fileURLToPath(new URL(`../icons/${size===180?'apple-touch-icon':`icon-${size}`}.png`,import.meta.url))});
    await page.close();
  }
}finally{await browser.close();}

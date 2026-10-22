import type {Service} from "@/lib/types";

// Driver-facing examples, not diagnoses. Relevance is based on the actual
// services configured by this workshop, not on a fixed category menu.
const rules:{pattern:RegExp;symptoms:string[]}[]=[
 {pattern:/엔진오일|오일|윤활/i,symptoms:["오일 교환 시기가 되었어요","오일이 새는 것 같아요","엔진 소음이 커졌어요"]},
 {pattern:/타이어|휠|얼라인|펑크/i,symptoms:["주행 중 핸들이 떨려요","타이어 공기압 경고등이 켜졌어요","타이어 마모가 심해 보여요"]},
 {pattern:/브레이크|제동|패드|디스크/i,symptoms:["브레이크를 밟으면 소음이 나요","제동할 때 차가 떨려요","브레이크 페달 느낌이 달라졌어요"]},
 {pattern:/배터리|시동|전기|충전/i,symptoms:["시동이 잘 걸리지 않아요","배터리 경고등이 켜졌어요","배터리 교체 시기를 확인하고 싶어요"]},
 {pattern:/에어컨|히터|공조/i,symptoms:["에어컨 바람이 시원하지 않아요","송풍 시 냄새가 나요","히터가 따뜻하지 않아요"]},
 {pattern:/엔진|고장|점검|진단|정비|수리/i,symptoms:["계기판 경고등이 켜졌어요","주행 중 이상한 소음이 나요","가속할 때 출력이 부족해요"]},
 {pattern:/미션|변속|클러치/i,symptoms:["변속할 때 충격이 있어요","변속이 매끄럽지 않아요"]},
 {pattern:/하체|서스펜션|쇼바|핸들/i,symptoms:["방지턱을 넘을 때 소리가 나요","차량이 한쪽으로 쏠려요"]}
];
export function suggestedSymptoms(services:Service[]):string[]{
 const set=new Set<string>();
 for(const service of services){
  const text=service.name+" "+(service.description||"");
  for(const item of rules)if(item.pattern.test(text))
    for(const symptom of item.symptoms)set.add(symptom);
 }
 if(!set.size&&services.length)set.add("점검받고 싶은 증상을 직접 적을게요");
 return Array.from(set).slice(0,12);
}

import Link from "next/link";
export default function TestDataNotice(){
 return <main className="auth-layout">
  <article className="auth-card" style={{maxWidth:660}}>
   <span className="eyebrow">MECA OWNER REHEARSAL</span>
   <h1>체험용 정비소 데이터 안내</h1>
   <p><strong>이 페이지는 연습용 안내이며 실제 미스터엠의 개인정보 처리방침이 아닙니다.</strong></p>
   <p>이 체험은 개발된 예약·매장 운영 기능을 확인하기 위한 것입니다. 실제 고객의 이름, 전화번호, 차량번호, 수리 이력, 다른 민감한 정보를 입력하지 마세요. 테스트를 위한 가상의 값만 사용하세요.</p>
   <p>입력한 데이터는 MECA 테스트 정비소의 데이터베이스에 저장될 수 있으며 자동으로 즉시 삭제되지 않습니다. 기록 정리가 필요하면 운영자에게 테스트 정비소 삭제를 요청하세요. 이 페이지를 실제 사업장의 개인정보 처리방침으로 사용해서는 안 됩니다.</p>
   <p>운영용 정비소는 실제 개인정보 처리방침과 보관·삭제 기준을 마련하고 별도로 공개해야 합니다.</p>
   <Link href="/pilot/owner-test" className="btn btn-dark">사장님 체험으로 돌아가기</Link>
  </article>
 </main>;
}

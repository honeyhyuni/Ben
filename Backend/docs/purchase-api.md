# 사입 API 계약

- 프론트 코드는 변경하지 않는다. 기본 경로 `/api/purchase`, 운영자 경로 `/api/admin/purchase`.
- JWT Bearer 또는 기존 로그인 쿠키. 운영자는 SUPER_ADMIN/ADMIN, 고객은 MAIN/SUB. 고객만 장바구니와 주문 생성 가능.
- 상품은 전체 고객에게 공개되는 공용 카탈로그. 판매 중지 상품은 신규 담기/주문 불가.
- 사진 최대 10장, 배열 순서 첫 장이 대표. 자유 입력 컬러/사이즈 조합별 variant ID로 주문한다. 삭제된 옵션은 비활성화하고 과거 주문은 보존한다.
- 장바구니는 accountId+userId 단위. 주문 조회는 고객사 단위이며 주문자를 기록한다.
- 금액은 CNY 소수 둘째 자리 문자열. 부동소수점 대신 정수 단위로 계산한다.
- MOQ는 주문에서 선택한 해당 상품의 모든 옵션 수량 합계 기준. 장바구니 저장 중에는 미달 가능.
- 주문 요청에 requestKey(UUID), cartItemIds, expectedTotal, shippingMethod(SEA/AIR)를 전달한다. 최신 합계와 다르면 409 PRICE_CHANGED. 동일 요청키 재시도는 기존 주문 반환, 다른 본문이면 409.
- 회사 예치금 잠금 → 상품/장바구니 검증 → 주문 및 스냅샷 → 예치금 차감 → 선택 행 삭제를 한 트랜잭션으로 처리한다. 실패 시 모두 롤백.
- 배송비 정책 미정: 배송 방식만 기록하며 이번 차감액은 수수료 포함 상품대금이다. 배송비 무료라는 의미는 아니다.

## 엔드포인트

| 메서드/경로 | 기능 |
| --- | --- |
| GET /api/purchase/products | 공개 상품 검색, 시장 필터, 페이지 조회 |
| GET /api/purchase/products/{id} | 상품/사진/활성 옵션 상세 |
| GET, POST /api/admin/purchase/products | 운영자 조회/등록 |
| PATCH /api/admin/purchase/products/{id} | 상품 정보/옵션/사진 순서/판매 여부 수정 |
| POST /api/admin/purchase/products/import | 일괄 상품 등록 |
| POST /api/admin/purchase/products/{id}/images | multipart file 업로드 |
| DELETE /api/admin/purchase/products/{id}/images/{imageId} | 사진 제거 |
| GET /api/purchase/images/{imageId} | 인증된 사용자 이미지 조회 |
| GET /api/purchase/cart | 본인 장바구니 및 최신 합계 |
| PUT /api/purchase/cart/items | variantId별 수량 설정(추가가 아닌 절대 수량) |
| DELETE /api/purchase/cart/items/{id} | 본인 장바구니 행 삭제 |
| POST /api/purchase/orders | 선택 행 주문, 예치금 차감 |
| GET /api/purchase/orders | 고객사 주문 목록 |
| GET /api/purchase/orders/{id} | 고객사 주문 상세 |
| GET /api/admin/purchase/orders | 운영자 전체 주문 조회 |
| GET /api/admin/purchase/orders/{id} | 운영자 주문 상세 |

## 요청 예시

상품 등록: `{"market":"완지아","shopNumber":"3F221","productNumber":"22001#","unitPrice":"35.00","sizes":["F"],"colors":[{"name":"블랙","hex":"#000000"}],"moq":10,"leadTime":"3~5일","memo":"고객 노출 메모","active":true}`

상품 수정은 등록 필드 중 변경할 필드만 전달. sizes/colors 변경 시 해당 목록 전체 교체. 같은 이름 조합은 variant ID 유지. 사진 순서 변경은 imageIds 배열에 해당 상품의 모든 사진 ID를 순서대로 전달.

장바구니: `{"variantId":"UUID","quantity":20,"note":"택 제거 요청"}`. 동일 상품의 옵션별 요청사항을 저장한다.

주문: `{"requestKey":"UUID","cartItemIds":["UUID"],"expectedTotal":"700.00","shippingMethod":"SEA"}`

목록: `?page=1&pageSize=20&q=22001&market=완지아`. 응답 `{items,total,page,pageSize}`.

상품 사진은 JPEG/PNG/WebP, 파일당 최대 5MiB. 현재 저장소 설정이 없으므로 별도 이미지 테이블에 저장하며 목록에서는 내용 제외. 운영 S3 연결 시 저장 계층 교체 가능.

## 엑셀 일괄 등록
- `POST /api/admin/purchase/products/import`: multipart `file`로 최대 2MiB의 .xlsx 전달. 첫 시트에 최대 100상품.
- 첫 행 헤더 순서: `market, shopNumber, productNumber, unitPrice, sizes, colors, moq, leadTime, memo`.
- 사이즈/컬러는 `F|XL`, `블랙|진청`처럼 |로 구분한다. 수식은 허용하지 않는다.
- 사진은 등록 후 별도 업로드. 컬러 HEX는 상품 수정 API에서 설정 가능.
- JSON `{ "items": [상품등록본문, ...] }`도 지원한다. 중복/검증 실패 시 전체 미등록.
- 컬러/사이즈 각 50개, 조합은 상품당 최대 500개.

## 오류 및 재시도
- 400: VALIDATION_ERROR, INVALID_IMPORT_ROW(행 번호 포함), INVALID_HEADERS, INVALID_IMAGE, INVALID_IMAGE_ORDER, VARIANT_LIMIT
- 401/403: 로그인 없음 또는 권한 없음
- 404: 상품/주문 없음 또는 본인 장바구니 항목 아님
- 409: DUPLICATE_PRODUCT, PRODUCT_UNAVAILABLE, IMAGE_LIMIT, MOQ_NOT_MET, PRICE_CHANGED, INSUFFICIENT_BALANCE, IDEMPOTENCY_CONFLICT
- 주문 응답을 받지 못했을 때만 동일 requestKey와 동일 본문으로 재시도. 가격/선택 항목을 바꾸면 새 requestKey 사용.
- SUB는 주문을 통한 예치금 사용 가능. 예치금 수기 등록/취소 API 권한은 운영자 전용으로 유지.
- 주문 상태는 현재 PLACED. 취소·환불·진행 상태 변경과 배송비 계산은 이번 범위에 포함하지 않는다.

## 로컬 검증
```powershell
$env:BEN_PURCHASE_DB_TEST='1'
$env:BEN_PURCHASE_HTTP_TEST='1' # localhost:3000 실행 필요
$env:BEN_INVITATION_DB_TEST='1'
$env:BEN_DEPOSIT_DB_TEST='1'
npm test
```
테스트 전용 사용자/고객사/상품/주문/예치금과 Redis 세션을 생성하고 종료 시 정리한다. 운영 DB에서 실행하지 않는다.

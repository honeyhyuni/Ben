import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseWorkbook } from "./import";
async function workbook(value: string | { formula: string; result: number } = "35") {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("상품");
  sheet.addRow(["market", "shopNumber", "productNumber", "unitPrice", "sizes", "colors", "moq", "leadTime", "memo"]);
  sheet.addRow(["완지아", "3F221", "22001#", value, "F|XL", "블랙|진청", 10, "3~5일", "메모"]);
  return new File([new Uint8Array(await book.xlsx.writeBuffer())], "products.xlsx");
}
describe("Excel import contract", () => {
  it("reads custom options from the first worksheet", async () => {
    const rows = await parseWorkbook(await workbook());
    expect(rows[0].sizes).toEqual(["F", "XL"]);
    expect(rows[0].colors.map(c => c.name)).toEqual(["블랙", "진청"]);
    expect(rows[0].moq).toBe(10);
  });
  it("rejects formulas rather than trusting cached amounts", async () => {
    await expect(parseWorkbook(await workbook({ formula: "1+1", result: 2 }))).rejects.toMatchObject({ code: "INVALID_CELL" });
  });
  it("reports invalid row and corrupt file", async () => {
    await expect(parseWorkbook(await workbook("invalid"))).rejects.toMatchObject({ code: "INVALID_IMPORT_ROW" });
    await expect(parseWorkbook(new File(["invalid"], "products.xlsx"))).rejects.toMatchObject({ code: "INVALID_WORKBOOK" });
  });
});

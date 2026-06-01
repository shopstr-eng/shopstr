import {
  formatCurrentDateTimeLocalValue,
  formatDateTimeLocalValue,
  formatUnixTimestampAsDateTimeLocalValue,
} from "../datetime-local";

describe("datetime-local helpers", () => {
  it("formats local date parts without converting to UTC", () => {
    const dateLike = {
      getFullYear: () => 2026,
      getMonth: () => 3,
      getDate: () => 9,
      getHours: () => 7,
      getMinutes: () => 5,
    };

    expect(formatDateTimeLocalValue(dateLike)).toBe("2026-04-09T07:05");
  });

  it("formats unix timestamps using local date values", () => {
    const getFullYearSpy = jest.spyOn(Date.prototype, "getFullYear");
    const getMonthSpy = jest.spyOn(Date.prototype, "getMonth");
    const getDateSpy = jest.spyOn(Date.prototype, "getDate");
    const getHoursSpy = jest.spyOn(Date.prototype, "getHours");
    const getMinutesSpy = jest.spyOn(Date.prototype, "getMinutes");

    try {
      getFullYearSpy.mockReturnValue(2027);
      getMonthSpy.mockReturnValue(10);
      getDateSpy.mockReturnValue(3);
      getHoursSpy.mockReturnValue(14);
      getMinutesSpy.mockReturnValue(8);

      expect(formatUnixTimestampAsDateTimeLocalValue(1730671680)).toBe(
        "2027-11-03T14:08"
      );
    } finally {
      getFullYearSpy.mockRestore();
      getMonthSpy.mockRestore();
      getDateSpy.mockRestore();
      getHoursSpy.mockRestore();
      getMinutesSpy.mockRestore();
    }
  });

  it("formats the current local time for datetime-local minimums", () => {
    const now = new Date("2026-04-13T18:42:59.999Z");

    const getFullYearSpy = jest.spyOn(now, "getFullYear");
    const getMonthSpy = jest.spyOn(now, "getMonth");
    const getDateSpy = jest.spyOn(now, "getDate");
    const getHoursSpy = jest.spyOn(now, "getHours");
    const getMinutesSpy = jest.spyOn(now, "getMinutes");

    try {
      getFullYearSpy.mockReturnValue(2026);
      getMonthSpy.mockReturnValue(3);
      getDateSpy.mockReturnValue(13);
      getHoursSpy.mockReturnValue(0);
      getMinutesSpy.mockReturnValue(12);

      expect(formatCurrentDateTimeLocalValue(now)).toBe("2026-04-13T00:12");
    } finally {
      getFullYearSpy.mockRestore();
      getMonthSpy.mockRestore();
      getDateSpy.mockRestore();
      getHoursSpy.mockRestore();
      getMinutesSpy.mockRestore();
    }
  });
});

# v4.21 checks (2026-11-05) — 生產日報／週報 中文人性化版（vrt-daily-report-v1.js 2.0）

Paul 11/05: only Chinese; tidy layout; correct numbers; calendar-aware; compare this month / last month / the month before;
think about orders, shipments, manpower and events; at least ten-odd scenario styles instead of one formula; links back to the site.

    node qa/v421/test_story_report.js   # 18/18 — Cambodian 2026 public holidays (Nov = 21 workdays), month comparison per production day
                                        # (earned hours = pcs × SMV when producedMinutes is missing), 19 scenarios (month start, after holiday,
                                        # before holiday, month end, behind, ahead, efficiency up/down, manpower, product mix, partial reports,
                                        # quality, shipping, fabric, WIP pile-up, backlog high/low/ok, steady, no data), openings vary by date,
                                        # Chinese only, no banned phrases (不是…而是 / 值得注意 / 說白了 / 破折號), every number passes checkAiText,
                                        # week + plan reports, AI prompt (Chinese only, Paul's report samples, numbers only from facts), aiHtml.

`qa/v420/test_readable_report.js` now targets `renderV13` (the v1.3 layout is kept for the 中＋英 view); `render(f,{lang:'zh'})` is the new story layout.
Older qa/v416 / v417 render-layout failures pre-date this change (they test the v1.2/v1.3 wording).

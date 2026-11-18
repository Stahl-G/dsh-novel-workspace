/**
 * Checks ONE explicit, author-confirmed arithmetic relationship, not prose or physics.
 * No I/O, inference, unit conversion, permission decision or manuscript mutation.
 */
export function checkDeclaredDuration({ rule, scene } = {}) {
  const skip = (reason) => ({ status: "not-checked", basis: "declared-world-rule", reason });
  if (!rule || !scene || rule.confirmed !== true || scene.confirmed !== true)
    return skip("规则或场景条件尚未由作者确认。");
  if (rule.unit !== "minute" || scene.unit !== "minute")
    return skip("只检查明确且相同的分钟单位，不猜测或换算单位。");
  if (typeof rule.scope !== "string" || !rule.scope.trim() || rule.scope !== scene.scope)
    return skip("规则和场景的适用范围不明确或不同。");
  if (scene.constantDuration !== true || scene.extraDelayMinutes !== 0 || scene.exception !== "none")
    return skip("恒定圈时、额外耗时或虚构例外尚不满足明确的检查条件。");
  if (![rule.minutesPerCycle, scene.cycles, scene.elapsedMinutes].every((n) => Number.isSafeInteger(n) && n > 0))
    return skip("仅支持明确的正整数圈数和分钟数；未知、约数或小数留给作者判断。");
  if (![rule.quote, scene.quote].every((text) => typeof text === "string" && text.trim()))
    return skip("缺少规则或正文引文，不能交付可核对的检查。");
  const expectedMinutes = rule.minutesPerCycle * scene.cycles;
  if (!Number.isSafeInteger(expectedMinutes)) return skip("数值超出精确整数运算范围。");
  return {
    status: expectedMinutes === scene.elapsedMinutes ? "consistent" : "conflict",
    basis: "declared-world-rule",
    expectedMinutes,
    observedMinutes: scene.elapsedMinutes,
    equation: `${rule.minutesPerCycle} × ${scene.cycles} = ${expectedMinutes} 分钟`,
    evidence: { rule: rule.quote, scene: scene.quote },
    caveat: "仅核对作者确认的书内算术前提；不是现实科学事实，也未自动理解或验证引文。"
  };
}

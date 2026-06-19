/**
 * insurance_scoring_engine.js
 * data.json を受け取り診断結果を返す純粋関数モジュール
 */

const InsuranceEngine = (() => {

  // ─── スコア計算 ───────────────────────────────────────
  function calcScores(answers, data) {
    return data.companies.map(company => {
      let total = 0;
      const tags = [];

      for (const rule of data.scoringRules) {
        const qid = rule.questionId;
        const userAnswer = answers[qid];
        const matchedCase = rule.cases.find(c => c.answerValue === userAnswer);
        if (!matchedCase) continue;

        // 会社ボーナス（年齢など特定ルール）
        if (matchedCase.companyBonus) {
          const bonus = matchedCase.companyBonus[company.name] || 0;
          total += bonus;
          if (bonus > 0 && matchedCase.tag) tags.push(matchedCase.tag);
          continue;
        }

        // 逆スコア（repair_no → 補償が薄い会社を優遇）
        if (matchedCase.invertScore) {
          total += matchedCase.baseValue - company.scores[matchedCase.scoreKey];
          continue;
        }

        // 複数スコアキー（balance: cost + support）
        if (matchedCase.scoreKeys) {
          const sum = matchedCase.scoreKeys.reduce((acc, k) => acc + company.scores[k], 0);
          total += sum * matchedCase.multiplier;
          if (matchedCase.tag && matchedCase.tagCondition) {
            const allAbove = matchedCase.scoreKeys.every(k => company.scores[k] >= 3);
            if (allAbove) tags.push(matchedCase.tag);
          }
          continue;
        }

        // 通常スコア
        if (matchedCase.scoreKey && matchedCase.multiplier !== undefined) {
          const pts = company.scores[matchedCase.scoreKey] * matchedCase.multiplier;
          total += pts;
          if (matchedCase.tag && matchedCase.tagThreshold) {
            if (company.scores[matchedCase.scoreKey] >= matchedCase.tagThreshold) {
              tags.push(matchedCase.tag);
            }
          }
        }
      }

      return {
        name:        company.name,
        score:       Math.round(total * 10) / 10,
        tags:        [...new Set(tags)],
        description: company.description
      };
    });
  }

  // ─── ランキング ───────────────────────────────────────
  function buildRanking(scored) {
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const max = sorted[0].score;
    return sorted.map((item, i) => ({
      rank:            i + 1,
      name:            item.name,
      score:           item.score,
      normalizedScore: Math.round((item.score / max) * 100),
      tags:            item.tags,
      description:     item.description
    }));
  }

  // ─── タイプ判定 ───────────────────────────────────────
  function resolveType(answers, data) {
    for (const rule of data.typeRules) {
      const conds = rule.conditions;
      const matched = Object.entries(conds).every(
        ([qid, val]) => answers[parseInt(qid)] === val
      );
      if (matched) return rule.label;
    }
    return 'バランス重視タイプ';
  }

  // ─── 理由生成 ─────────────────────────────────────────
  function buildReasons(answers, data) {
    return data.reasonMap
      .filter(r => answers[r.questionId] === r.answerValue)
      .map(r => r.text);
  }

  // ─── メイン診断関数 ───────────────────────────────────
  function diagnose(answers, data) {
    const scored   = calcScores(answers, data);
    const ranking  = buildRanking(scored);
    const typeLabel = resolveType(answers, data);
    const reasons  = buildReasons(answers, data);
    const matchedTags = [...new Set(ranking.slice(0, 3).flatMap(r => r.tags))];

    return {
      topCompany:  ranking[0].name,
      ranking,
      typeLabel,
      reasons,
      matchedTags
    };
  }

  return { diagnose };
})();

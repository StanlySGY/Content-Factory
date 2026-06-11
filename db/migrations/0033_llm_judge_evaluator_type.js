/* eslint-disable */
// 0033 — Product Gap 18：允许 LLM judge 评价类型。
//
// 设计要点：
//   - 仅扩展 execution_result_evaluations.evaluator_type 约束。
//   - 不修改既有评价行，不改变 append-only evaluation 账本语义。

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE execution_result_evaluations
      DROP CONSTRAINT execution_result_evaluations_type_chk;
    ALTER TABLE execution_result_evaluations
      ADD CONSTRAINT execution_result_evaluations_type_chk
      CHECK (evaluator_type IN ('human','rule','llm'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE execution_result_evaluations
      DROP CONSTRAINT execution_result_evaluations_type_chk;
    ALTER TABLE execution_result_evaluations
      ADD CONSTRAINT execution_result_evaluations_type_chk
      CHECK (evaluator_type IN ('human','rule'));
  `);
};

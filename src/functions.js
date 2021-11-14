const { BigNumber } = require("bignumber.js");
const { rayMul, calculateCompoundedInterest, calculateLinearInterest } = require("@aave/protocol-js")

BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

const calculateBalance = (data, currentTimestamp) => {
  if (data.interest_rate_mode === 0) {
    const linearInterest = calculateLinearInterest(
      new BigNumber(data.current_liquidity_rate),
      currentTimestamp,
      data.last_update,      
    );

    const reserveNormalizedIncome = rayMul(linearInterest, data.liquidity_index);

    return rayMul(data.balance, reserveNormalizedIncome);
  }
  if (data.interest_rate_mode === 2) {
    const debt = calculateCompoundedInterest(
      new BigNumber(data.current_variable_borrow_rate),
      currentTimestamp,
      data.last_update,
    );

    return rayMul(data.balance, rayMul(debt, data.variable_borrow_index));
  }
};

module.exports = {
  calculateBalance
}

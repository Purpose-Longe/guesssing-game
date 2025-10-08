async function getRoundForUpdate(client, roundId) {
  const res = await client.query('SELECT id, answer_normalized, question, started_at, ends_at FROM rounds WHERE id=$1 FOR UPDATE', [roundId]);
  return res.rows[0] || null;
}

async function setRoundWinner(client, roundId, playerId) {
  await client.query('UPDATE rounds SET winner_player_id=$1, ended_at=now() WHERE id=$2', [playerId, roundId]);
}

module.exports = { getRoundForUpdate, setRoundWinner };

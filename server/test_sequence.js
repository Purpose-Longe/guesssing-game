(async () => {
  try {
    const base = process.env.TEST_SERVER_URL || 'http://localhost:4000';
    const headers = { 'content-type': 'application/json' };

    console.log('Creating session...');
    let r = await fetch(`${base}/api/sessions`, { method: 'POST', headers });
    let session = await r.json();
    console.log('session:', session);
    const sessionId = session.id;

    console.log('Creating player1 Alice...');
    r = await fetch(`${base}/api/players`, { method: 'POST', headers, body: JSON.stringify({ session_id: sessionId, username: 'Alice' }) });
    const p1 = await r.json();
    console.log('p1:', p1);

    console.log('Creating player2 Bob...');
    r = await fetch(`${base}/api/players`, { method: 'POST', headers, body: JSON.stringify({ session_id: sessionId, username: 'Bob' }) });
    const p2 = await r.json();
    console.log('p2:', p2);

    console.log('Creating player3 Carol...');
    r = await fetch(`${base}/api/players`, { method: 'POST', headers, body: JSON.stringify({ session_id: sessionId, username: 'Carol' }) });
    const p3 = await r.json();
    console.log('p3:', p3);

    console.log('Setting game master to Alice...');
    await fetch(`${base}/api/sessions/${sessionId}`, { method: 'PUT', headers, body: JSON.stringify({ game_master_id: p1.id }) });

    console.log('Starting round with answer "Paris"...');
    await fetch(`${base}/api/sessions/${sessionId}`, { method: 'PUT', headers, body: JSON.stringify({ status: 'in_progress', current_question: 'Capital of France?', current_answer: 'Paris', duration: 60 }) });

    console.log('Player2 (Bob) submitting correct guess "Paris"...');
    r = await fetch(`${base}/api/submit_guess`, { method: 'POST', headers, body: JSON.stringify({ session_id: sessionId, player_id: p2.id, guess: 'Paris' }) });
    const submitResp = await r.json();
    console.log('submit response:', submitResp);

    // allow server to process
    await new Promise((res) => setTimeout(res, 500));

    console.log('Fetching session row...');
    r = await fetch(`${base}/api/sessions/${sessionId}`);
    const finalSession = await r.json();
    console.log('final session:', finalSession);

    process.exit(0);
  } catch (err) {
    console.error('test sequence failed', err);
    process.exit(1);
  }
})();

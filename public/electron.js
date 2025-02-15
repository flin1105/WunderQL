// const { fetch } = require('cross-fetch');
// const { performance } = require('perf_hooks');
const path = require('path');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const isDev = require('electron-is-dev');
const { checkResponseTime, loadTest, checkIfQueryExist } = require('./utils');
const db = require('../models/User');
const url = require('url');

//-------Electron Setup--------------------------------------------------------
function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 1000,
    minHeight: 700,
    icon: `${__dirname}/assets/icon.png`,
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      /* eng-disable PRELOAD_JS_CHECK */
      disableBlinkFeatures: 'Auxclick'
    },
  });

  win.setResizable(true);

  // and load the index.html of the app.
  // win.loadURL(
  //   isDev
  //     ? 'http://localhost:3000'
  //     :  path.join(__dirname, 'dist', 'index.html')
  // );
 
  // win.loadFile(path.join(__dirname, 'index.html'));
  // win.loadURL(url.format({
  //   pathname: path.join(__dirname, 'index.html'),
  //   protocol: 'file:',
  //   slashes: true
  // }));
  // console.log(path.join(__dirname, 'index.html'))
  // Quit app when closed; closes all children windows too

  const indexPath = url.format({
    protocol: 'file:',
    pathname: path.join(__dirname, '../dist', 'index.html'),
    slashes: true,
  });

  win.loadURL(indexPath);


  win.on('closed', function(){
    app.quit();
  });
  
  // Build menu from template
  // const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);

  // Menu.setApplicationMenu([]);
  // Menu.setApplicationMenu(mainMenu);
  // Open the DevTools.
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

}

// Create menu template
const mainMenuTemplate =  [
  // Each object is a dropdown
  {
    label: 'Raubern',
    submenu:[
      {
        label:'Add Item',
        click(){
          // createAddWindow();
        }
      },
      {
        label:'Clear Items',
      },
      {
        label: 'Refresh',
      },
      {
        label: 'Quit',
        accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q',
        click(){
          app.quit();
        }
      }
    ]
  },

];

// This method will be called when Electron has finished initialization and is ready to create browser windows.
// app.whenReady().then(createWindow);
app.on('ready', createWindow);


// Quit when all windows are closed, except on macOS. There, it's common for applications and their menu bar to stay active until the user quits
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

//-------------------------------------------------------------------------------


ipcMain.on('signUpToMain', async (event, arg) => {
  //Get Users Name and Password from Login Form
  let doesUserExist = false;
  console.log('from electron.js function signUpToMain', arg);
  try {

    const doesUserExistsQuery = {
      text : 'SELECT * FROM users WHERE username = $1 OR email = $2',
      values: [arg.username, arg.email],
    };

    // Check to see if username or email already exists in database
    const usersExist = await db.query(doesUserExistsQuery);
    if(usersExist.rows.length){
      doesUserExist= true;
      console.log(`doesUserExist: ${doesUserExist} Need to implement a notifcation to say User or Email already exists`);
    } else {
      const createNewUserQuery = {
        text: 'INSERT INTO users(username, password, email, name) VALUES ($1, $2, $3, $4) RETURNING _id',
        values: [arg.username, arg.password, arg.email, arg.fullName]
      };

      const newUserID = await db.query(createNewUserQuery);
      //do I need to send back to front end?
      doesUserExist = true;
      event.sender.send('fromMainSignup', doesUserExist);
      console.log('newUserID from electron.js', newUserID.rows[0]._id);
      event.sender.send('userIdFromMain', newUserID.rows[0]._id);
    }


  } catch (err) {
    console.log(err);
    return err;
  }  
});


//! #1 loginToMain - User logins 
ipcMain.on('loginToMain', async (event, arg) => {
  //Get Users Name and Password from Login Form
  try {
    let userId;
    const validateUserQuery = {
      text : 'SELECT * FROM users WHERE username = $1 AND password = $2',
      values: [arg.username, arg.password],
    };

    //Check to see if valid username and password combination exists
    const validUsers = await db.query(validateUserQuery);
    // console.log(validUsers);
    if(validUsers.rows.length){
      userId=validUsers.rows[0]._id;
      event.sender.send('userLoggedInFromMain', true);
      // Gets sent to App.js
      event.sender.send('userIdFromMain', userId);
    } 

    console.log(userId);
    // should the following go inside the above conditional?
    const getUrlsQuery = {
      text: 'SELECT _id, url, nickname FROM graphqlurls WHERE user_id = $1',
      values: [userId]
    };
    const queryResult = await db.query(getUrlsQuery);
    const results = queryResult.rows;
    event.sender.send('urlsFromMain', results);

  } catch (err) {
    console.log(err);
    return err;
  }  
});

//! #2 urlToMain - User selects a URL
ipcMain.on('urlToMain', async (event, arg) => {
  try {
  
    //* * ///////////////////////////////////////////////////////////////////////////////////////////////
    //* * Check if URL Exists and Insert it not
    //check if the url exists 
    const checkIfUrlExists = {
      text: 'SELECT * FROM graphqlurls WHERE url = $1 AND user_id = $2',
      values: [arg.url, arg.userID],
    };
    const existingUrlResult = await db.query(checkIfUrlExists);
    const existingUrlId = existingUrlResult.rows;
    let urlId;
    if (!existingUrlId.length) {
      const insertUrl = {
        text: 'INSERT INTO graphqlurls(url, nickname, user_id) VALUES ($1, $2, $3) RETURNING _id',
        values: [arg.url, arg.nickname, arg.userID],
      };
      const queryResult = await db.query(insertUrl);
      urlId = queryResult.rows[0]._id;
    } else {
      urlId = existingUrlId[0]._id;
    }
    // Send id  back to Home.jsx 
    event.sender.send('idFromMain', urlId);
    //* * ///////////////////////////////////////////////////////////////////////////////////////////////

    // get all queries for specific url (we have id from above)
    const getQueriesQuery = {
      text: 'SELECT _id, query_string, query_name FROM queries WHERE url_id = $1',
      values: [urlId]
    };
    const queryResult = await db.query(getQueriesQuery);
    const allQueries = queryResult.rows;
    console.log('allQueries', allQueries);
    event.sender.send('queriesFromMain', allQueries);

    // // Send urls to Home.jsx so the options can update
    // const getUrlsQuery = {
    //   text: 'SELECT _id, url, nickname FROM graphqlurls WHERE user_id = $1',
    //   values: [arg.userId]
    // }
    // const urlsResult = await db.query(getUrlsQuery);
    // const results = urlsResult.rows;
    // event.sender.send("urlsFromMain", results)

  } catch (err) {
    console.log(err);
    return err;
  }
  
});

//! #3 queryTestToMain - User selects a query to test
ipcMain.on('queryTestToMain', async (event, arg) => {
  try {
    const responseTime = await checkResponseTime(arg.query, arg.url);
    const queryId = await checkIfQueryExist(arg.query, arg.urlID, arg.name);
  

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Insert response time with query_id into database 
    const insertResponseTime = {
      text: 'INSERT INTO response_times(response_time, query_id, date) VALUES ($1, $2, $3)',
      values: [responseTime, queryId, new Date()]
    };
    await db.query(insertResponseTime);
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
  
  
    const getResponseTimes = {
      text: 'SELECT * FROM response_times WHERE query_id = $1;',
      values: [queryId]
    };
    const responseTimesQueryResults = await db.query(getResponseTimes);
    const responseTimes = responseTimesQueryResults.rows;
    //Send back array of response times for that query
    event.sender.send('responseTimesFromMain', responseTimes);


    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Once new query is in database, send updated state to Test-Query so the new query name is reflected in the dropdown
    const getQueriesQuery = {
      text: 'SELECT _id, query_string, query_name FROM queries WHERE url_id = $1',
      values: [arg.urlID]
    };
    const queryResult = await db.query(getQueriesQuery);
    const allQueries = queryResult.rows;
    event.sender.send('queriesFromMain', allQueries);
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////


  } catch (err) {
    console.log(err);
    return err;
  }  
});

//! #4 loadTestQueryToMain - User selects a query to load test 
ipcMain.on('loadTestQueryToMain', async (event, arg) => {
  try {
    // Conduct load test
    const loadTestResults = await loadTest(
      arg.numOfChildProccesses,
      arg.url,
      arg.query,
    );

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    //save load test results in db associating it to a specific query
    const queryId = await checkIfQueryExist(arg.query, arg.urlID, arg.loadTestQueryName);
    const insertLoadTestResults = {
      //create new row in load test response time table (date, number_of_child_processes, average_response_time, result, query_id)
      text: 'INSERT INTO load_test_response_times (date, number_of_child_processes, average_response_time, result, query_id) VALUES($1, $2, $3, $4, $5)',
      values: [new Date(), arg.numOfChildProccesses, loadTestResults.averageResponseTime, loadTestResults.successOrFailure, queryId]
    };
    await db.query(insertLoadTestResults);
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////


    // Once the load test result is inserted, we need the application to receive the new list of updated queries
    const getQueriesQuery = {
      text: 'SELECT _id, query_string, query_name FROM queries WHERE url_id = $1',
      values: [arg.urlID]
    };
    const queryResult = await db.query(getQueriesQuery);
    const allQueries = queryResult.rows;
    event.sender.send('queriesFromMain', allQueries);


    ///////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Get allLoadTestResults from database and send all load test results to LoadTest.jsx
    const selectAllLoadTestResults = {
      text: 'SELECT * FROM load_test_response_times WHERE query_id = $1',
      values: [queryId]
    };
    const result = await db.query(selectAllLoadTestResults);
    const allLoadTestResults = result.rows;
    event.sender.send('loadTestResultsFromMain', allLoadTestResults);
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////


  } catch (err) {
    console.log(err);
    return err;
  }  
});

//! #5 dashboardToMain - User goes to dashboard
ipcMain.on('dashboardToMain', async (event, arg) => {
  console.log('in dashboardTomain', arg);

  const uniqueQueries = {
    text: `SELECT COUNT(q._id)
      FROM graphqlurls gu
      INNER JOIN queries q ON q.url_id = gu._id AND gu._id = $1`,
    values: [arg]
  };
  const numberOfTests = {
    text: `SELECT COUNT(rt._id)
      FROM graphqlurls gu
      INNER JOIN queries q ON q.url_id = gu._id AND gu._id = $1
      INNER JOIN response_times rt ON rt.query_id = q._id`,
    values: [arg]
  };
  const numberOfLoadTests = {
    text: `SELECT COUNT(lrt._id)
      FROM graphqlurls gu
      INNER JOIN queries q ON q.url_id = gu._id AND gu._id = $1
      INNER JOIN load_test_response_times lrt ON lrt.query_id = q._id`,
    values: [arg]
  };
  const numberOfLoadTestSuccesses = {
    text: `SELECT COUNT(lrt._id)
      FROM graphqlurls gu
      INNER JOIN queries q ON q.url_id = gu._id AND gu._id = $1
      INNER JOIN load_test_response_times lrt ON lrt.query_id = q._id AND lrt.result = 'success'`,
    values: [arg]
  };
  const numberOfLoadTestFailures = {
    text: `SELECT COUNT(lrt._id)
      FROM graphqlurls gu
      INNER JOIN queries q ON q.url_id = gu._id AND gu._id = $1
      INNER JOIN load_test_response_times lrt ON lrt.query_id = q._id AND lrt.result = 'failure'`,
    values: [arg]
  };
  const allQueries = {
    text: `SELECT rt.*
      FROM graphqlurls gu
      INNER JOIN queries q ON q.url_id = gu._id AND gu._id = $1
      INNER JOIN response_times rt ON rt.query_id = q._id`,
    values: [arg]
  };
  const allLoadTests = {
    text: `SELECT lrt.*
      FROM graphqlurls gu
      INNER JOIN queries q ON q.url_id = gu._id AND gu._id = $1
      INNER JOIN load_test_response_times lrt ON lrt.query_id = q._id`,
    values: [arg]
  };

  const result1 = await db.query(uniqueQueries);
  const result2 = await db.query(numberOfTests);
  const result3 = await db.query(numberOfLoadTests);
  const result4 = await db.query(numberOfLoadTestSuccesses);
  const result5 = await db.query(numberOfLoadTestFailures);
  const result6 = await db.query(allQueries);
  const result7 = await db.query(allLoadTests);
  const number_of_queries = result1.rows[0].count;
  const number_of_tests = result2.rows[0].count;
  const number_of_load_tests = result3.rows[0].count;
  const number_of_load_test_successes = result4.rows[0].count;
  const number_of_load_test_failures = result5.rows[0].count;
  const all_queries = result6.rows;
  const all_load_tests = result7.rows;

  // aggregate all response times by date
  const allQueriesRan = {};
  all_queries.forEach((query, index) => {
    const date = new Date(query.date).toDateString();
    allQueriesRan[date] = (allQueriesRan[date] || 0) + 1;
  });
  // aggregate all load tests by date
  const allLoadTestsRan = {};
  all_load_tests.forEach((query, index) => {
    const date = new Date(query.date).toDateString();
    allLoadTestsRan[date] = (allLoadTestsRan[date] || 0) + 1;
  });
  // combine all response times and load tests into single obj by date
  const queriesAndLoadsPerDay = [];
  Object.keys(allQueriesRan).forEach(el => {
    queriesAndLoadsPerDay.push({
      date: el, 
      query_tests: allQueriesRan[el], 
      query_load_tests: allLoadTestsRan[el]
    });
  });

  const results = {
    number_of_queries: number_of_queries,
    number_of_tests: number_of_tests,
    number_of_load_tests: number_of_load_tests,
    number_of_load_test_successes: number_of_load_test_successes,
    number_of_load_test_failures: number_of_load_test_failures,
    all_queries_and_load_tests: queriesAndLoadsPerDay
  };
  event.sender.send('totalsFromMain', results);
});


/* Inicializce */
var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');
var mongoose = require('mongoose');
var io = require('socket.io');
var mongoURI =  process.env.MONGOLAB_URI || 'mongodb://localhost/todos';
var Schema = mongoose.Schema;
var ObjectID = Schema.ObjectId;
var Todo = require('./models/todos.js').init(Schema, mongoose);


var connectWithRetry = function() {
  return mongoose.connect(mongoURI, function(err) {
    if (err) {
      console.error('Failed to connect to mongo on startup - retrying in 5 sec', err);
      setTimeout(connectWithRetry, 5000);
    }
  });
};

connectWithRetry();

mongoose.connection.on('open', function() {
  console.log("MongoDB");
});

var app = express();

app.configure(function() {
  app.set('port', process.env.PORT || 8080);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function() {
  app.use(express.errorHandler());
});

var server = http.createServer(app).listen(app.get('port'), function() {
  console.log("Express na portu " + app.get('port'));
});


var sio = io.listen(server);

var address_list = new Array();

sio.sockets.on('connection', function (socket) {
  var address = socket.handshake.address;

  if (address_list[address]) {
    var socketid = address_list[address].list;
    socketid.push(socket.id);
    address_list[address].list = socketid;
  } else {
    var socketid = new Array();
    socketid.push(socket.id);
    address_list[address] = new Array();
    address_list[address].list = socketid;
  }

  // zobrazi vsechny ukoly
  Todo.find({}, function(err, todos) {
    socket.emit('all',todos);
  });

  //adding

  socket.on('add', function(data) {
    var todo = new Todo({
      title: data.title,
      complete: false
    });

    todo.save(function(err) {
      if (err) throw err;
      socket.emit('added', todo );
      socket.broadcast.emit('added', todo);
    });
  });

  //deleting
  socket.on('delete', function(data) {
    Todo.findById(data.id, function(err, todo) {
      todo.remove(function(err) {
        if (err) throw err;
        socket.emit('deleted', data );
        socket.broadcast.emit('deleted', data);
      });
    });
  });

  //editting
  socket.on('edit', function(data) {
     Todo.findById(data.id, function(err, todo){
        todo.title = data.title;
        todo.save(function(err){
          if(err) throw err;
          socket.emit('edited', todo);
          socket.broadcast.emit('edited', todo);
        });
      });
  });

  //changing status
  socket.on('changestatus', function(data) {
    Todo.findById(data.id, function(err, todo) {
      todo.complete = data.status == 'complete' ? true : false;
      todo.save(function(err) {
        if(err) throw err;
        socket.emit('statuschanged', data );
        socket.broadcast.emit('statuschanged', data);
      });
    });
  });

  // changing status -- budouci zobrazovacka hotovych ukolu
  socket.on('allchangestatus', function(data) {
    var master_status = data.status == 'complete' ? true : false;
    Todo.find({}, function(err, todos) {
      for(var i = 0; i < todos.length; i++) {
        todos[i].complete = master_status;
        todos[i].save(function(err) {
          if (err) throw err;
          socket.emit('allstatuschanged', data);
          socket.broadcast.emit('allstatuschanged', data);
        });
      }
    });
  });

  // zobrazeni pouze hotovych
  socket.on('displaydone', function(data) {
    var doneTodos = true;
    Todo.find({}, function(err, todos) {
      for(var i = 0; i < todos.length; i++) {
        if(todos[i].status == doneTodos) {
          todos[i].save(function(err) {
            if (err) throw err;
            socket.emit('displaydone', data);
            socket.broadcast.emit('displaydone', data);
          });
        }
      }
    });
  });

  //disconnect state
  socket.on('disconnect', function() {
    var socketid = address_list[address].list;
    delete socketid[socketid.indexOf(socket.id)];
    if(Object.keys(socketid).length == 0) {
      delete address_list[address];
    }
    users = Object.keys(address_list).length;
    socket.emit('count', { count: users });
    socket.broadcast.emit('count', { count: users });
  });

});

// index
app.get('/', routes.index);

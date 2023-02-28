
var _ = require('lodash');
var Request = require('../models/request');
var AdminConnect = require('../models/adminconnect');
var config = require('../../config/libraries');
var User = require('../models/user');
var UserCentral = require('../models/usercentral');
var requestController = require('./requests');
var moment = require('moment-timezone');
var async = require('async');
var Peticion = require('../models/peticiontemp');
var PeticionBD = require('../models/peticion');
var Recordatorio = require('../models/recordatorio');
var CronJob = require('cron').CronJob;
var Version = require('../models/version');
var mongoose = require('mongoose');
var numclient = 0;
var numtaxistas = 0;
var numusuarios = 0;
module.exports = function (io) {//io es la instancia de socket.io



  var module = {};
  //canal de sockets solo para usuarios
  var users = io.of('/users');

  //canal de sockets solo para taxistas
  var taxis = io.of('/taxis');

  //canal de sockets para el mapa
  var mapa = io.of('/mapa');

  var versionserver;

  module.checkversion = function (req, res) {

    Version.findOne(
      { type: "taxi" }

      , {}, function (err, version) {

        if (err) return res.sendStatus(500);
        if (!version) return res.sendStatus(503);
        //   console.log("la version es:" + version.version_code);
        versionserver = version;
        taxis.emit('newversion', version);
        res.sendStatus(200);
      });

  };
  //Los socket solo reciben parametros, los envian al controlador, el controla
  // dor devulve una respuesta (o parametros) y envia  los parametros  de vuelta
  // en un socket emit, los parametros estan en ingles y no es necesaria
  // la documentacion tan especifica

  Version.findOne(
    { type: "taxi" }

    , {}, function (err, version) {
      versionserver = version;
    });
  mapa.on('connection', function (socket) {
    /*   numusuarios=numusuarios+1;
      console.log("Se conecto el usuarioweb: "+ socket.id+ " usuariosweb: "+numusuarios); */
    console.log("Se conecto el usuarioweb: " + socket.id);
    socket.emit('connected', socket.id);
    socket.on('signin', function (usuario, cb) {
      console.log("Se conecto el usuarioweb: " + usuario);
      console.log("se ejecuta signin userweb");
      /*     adminconnectData={};
          adminconnectData.socketid=socket.id;
          adminconnectData.admin=usuario;
          var adminconnect = new AdminConnect(adminconnectData); 
              adminconnect.save(function (err,idreq) {          
                if (!err) {
                  console.log("adminconnect creada");
                }
                cb('OK',socket.id);
              }); */

    });

    socket.on('detectphone', enviarphone);

    function enviarphone(dato, cb) {
      console.log("mensaje enviado:" + dato.phone);
      mapa.emit('detectphone', dato);
      console.log("mensaje enviado:" + dato);
      cb('OK');

    }


    /*  socket.on('detectarnumero',enviarnumero);
    
        function enviarnumero(dato,cb){
          
    
    console.log("numero detectado"+dato);
          AdminConnect.findOne({'admin':dato.usuario},{},function(err,user1){
            if(err) return cb('error',err.message);
            if(!user1) return cb(new Error('No User')); 
            console.log("objetivo:"+user1.socketid);      
            mapa.to(user1.socketid).emit('recibirnumero',dato);
            console.log("mensaje enviado:"+dato);
            cb('OK');
          });
    
    
    
          
        } */

    socket.on('disconnect', function () {
      /*      AdminConnect.findOneAndRemove({socketid: socket.id}, function(err,req){
            if(err) console.log(err);
            else {console.log("removido con exito");
            numusuarios=numusuarios-1;
            console.log("Se desconecto el usuarioweb: "+ socket.id+ " El nro usuariosweb: "+ numusuarios);
            delete socket;  
          }
        }); */


    });
  });
  users.on('connection', function (socket) {
    numclient = numclient + 1;
    console.log("Se conecto el cliente: " + socket.id + " clientes: " + numclient);
    //console.log("un usuario se conecto");
    //al conectarse un nuevo usuario, emito el evento 'connected'
    socket.emit('connected');

    //activo escuchadores de eventos
    //==============================

    socket.on('signin', signin);//registra el id del socket en un usuario cada
    // vez que este se conecta al canal de usuarios


    socket.on('new request', newrequest);//envia un pedido a todos los taxista
    // con la informacion del usuario
    socket.on('soloanotar', soloanotar);

    socket.on('newrequest_oferta', newrequestoferta);//envia un pedido a todos los taxista
    // con la informacion del usuario

    socket.on('cancel request', cancelrequest);//envia un mensaje de cancelacion
    //al taxista luego que acepto el pedido

    socket.on('finoperadora request', finoperadoraequest);//envia un mensaje de cancelacion
    //al taxista luego que acepto el pedido

    socket.on('precancel request', precancelrequest);// envia un "push" para que
    //el taxista borre un pedido de la lista

    socket.on('precancel_oferta', precanceloferta);// envia un "push" para que
    //el pasajero borre un pedido de la lista

    socket.on('guardar', saveop);

    socket.on('deleteaddress', deleteaddress);

    socket.on('guardarRecordatorio', saveRecordatorio);

    socket.on('closeallop', closeallop);

    socket.on('acceptoferta', acceptoferta);

    socket.on('aumentar', aumentar);

    socket.on('rechazaroferta', rechazaroferta);

    socket.on('msg_usertotaxi', msg_usertotaxi);

    socket.on('enviarubicacion', enviarubicacion);

    socket.on('sendShareLocation', sendShareLocation);

    socket.on('recibirShareLocation', recibirShareLocation);

    socket.on('finalizarenviarubicacion', finalizarenviarubicacion);

    socket.on('leavesharelocation', leavesharelocation);

    socket.on('disconnect', function () {

      //console.log("Un pasajero se desconecto con email: "+ socket.email + " y socket: "+ socket.id);
      //console.log("contenido:"+ socket+"");

      //añadido para eliminar peticion si se cierra o se desconecta en el radar o cuando el taxista esta en camino y el usuario cerro la app
      if (socket.email != "operador@") {
        Request.findOneAndRemove({
          $and: [

            { email: socket.email },
            { email_driver: { $exists: false } }

          ]
        }, function (err, deleted) {
          console.log(deleted);
          if (deleted) {
            var data = {};
            data.ide = "";
            data.email = socket.email;
            taxis.emit('precancel request', data);
          }
          Peticion.findOne({ 'email': socket.email })
            .sort({ date: -1 })
            .limit(1).exec(function (err, pedir) {
              if (pedir != null) {
                if (pedir.situation < 2) {

                  var update = {};
                  update.situation = 6;
                  //console.log(pedir._id);
                  /*Peticion.findOne({'email': socket.email})
                  .select('_id')
                  .sort({date:-1})
                  .limit(1).exec(function(err,pedir){*/
                  Peticion.findByIdAndUpdate(pedir._id, update, { new: true }, function (err, aff) {
                    //checksit
                    /*var peticionbdcopy=JSON.parse(JSON.stringify(aff));
                    delete peticionbdcopy._id;*/
                    console.log("se esta desconectando " + socket.email);
                    var peticionbdcopy = clonpeticion(aff);
                    var peticionbd = new PeticionBD(peticionbdcopy);
                    peticionbd.save(function (err) {
                      console.log(err);
                      // Request.findOneAndRemove({'email': socket.email}, function(err,deleted) {


                      requestController.mapupdatelist(
                        function (err, lista) {
                          if (!err) {
                            mapa.emit('new request mapa', lista);

                          }

                        });
                      // });
                    });


                  });
                  //});
                }
              }
            });
        });


      }

      // almacenando la desconexion
      /*      socket.emit('disconnected');
             User.findOne({email:socket.email},{},function(err, user){
              if(!user) return cb('error');
              
              user.connected = false;
              user.save(function(err){
                //if(err) return cb('error');
                //cb('OK');
                //// /
                //socket.emit('successful');
              })
            });*/
      //  
      numclient = numclient - 1;
      console.log("Se desconecto el cliente: " + socket.id + " El nro clientes: " + numclient);
      delete socket;

    });

    function msg_usertotaxi(user, cb) {


      User.findOne({ 'email': user.email }, {}, function (err, user1) {
        if (err) return cb('error', err.message);
        if (!user1) return cb(new Error('No User'));
        taxis.to(user1.socketid).emit('msg_usertotaxi', user);
        cb('OK', user.email);
      });

    }

    function enviarubicacion(user, cb) {
      User.findOne({ 'email': user.message }, {}, function (err, user1) {
        if (err) return cb('error', err.message);
        if (!user1) return cb('noexist', user.email);
        users.to(user1.socketid).emit('confirmarubicacioncompartida', user);
        cb('OK', user.email);
      });

    }

    function sendShareLocation(user, cb) {
      cb('OK');
      users.to(user.email).emit('ShareLocation', user);
    }

    function recibirShareLocation(user, cb) {
      cb('OK');
      socket.join(user.sharenumber, function () {
        // console.log("se ingreso al grupo: " +grupodefecto);
      });
    }

    function leavesharelocation(user, cb) {
      cb('OK');
      socket.leave(user.email, function () {
        // console.log("se ingreso al grupo: " +grupodefecto);
      });
    }

    function finalizarenviarubicacion(user, cb) {
      cb('OK');
      users.to(user.email).emit('retirarenviarubicacion', user);
    }

    function clonpeticion(data) {
      var clone = {}
      clone.address = data.address;
      clone.email = data.email;
      clone.email_driver = data.email_driver;
      clone.state = data.state;
      clone.promotion = data.promotion;
      clone.efectivo = data.efectivo;
      clone.datearrive = data.datearrive;
      clone.dateontravel = data.dateontravel;
      clone.gcm_id = data.gcm_id;
      clone.gcm_driver = data.gcm_driver;
      clone.latitude = data.latitude;
      clone.longitude = data.longitude;
      clone.name = data.name;
      clone.phone = data.phone;
      clone.to = data.to;
      clone.price = data.price;
      clone.exactprice = data.exactprice;
      clone.star = data.star;
      clone.situation = data.situation;
      clone.idrequest = data.idrequest;
      clone.noteservice = data.noteservice;
      clone.tipomovil = data.tipomovil;
      clone.zona = data.zona;
      clone.generado = data.generado;
      clone.aceptado = data.aceptado;
      clone.date = data.date;
      clone.empresa = data.empresa;
      clone.area = data.area;
      clone.note = data.note;
      clone.ubicationaccept = data.ubicationaccept;
      clone.ubicationtravel = data.ubicationtravel;
      clone.latitudfinish = data.latitudfinish;
      clone.longitudfinish = data.longitudfinish;
      clone.datefinish = data.datefinish;
      return clone;
    }

    //aun corrigiendo el accept

    function rechazaroferta(data, cb) {

      taxis.to(data.socket_driver).emit('rechazaroferta', data);

    }
    function acceptoferta(data, cb) {

      requestController.acceptOfertaSocket(data,
        function (err, req) {
          if (err) return cb(err);
          cb('OK');
          var midata = {};
          midata.email = data.email_user;
          //enviamos el email del taxista para filtrarlo con la app de la operadora y no borrar su petición
          midata.emaildriver = data.email_driver;
          midata.ide = data.ide;
          // es otro taken
          taxis.emit('taken', midata);
          taxis.to(data.socket_driver).emit('acceptoferta', data);

          //envia el emit a un usuario especifico en el canal de usuarios
          //users.to(socket_user).emit('accept',data_driver);
          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);

                cb("OK");
              }
              else {
                cb('error');
              }
            });
          //console.log(socket_user);

        });
    }

    function precancelrequest(data, cb) {
      var email_user = data.email;
      var ide = data.ide;
      //console.log(email_user);
      /*     if(ide=="operador@")     
           {
              ide=data.ide;
              //console.log(ide);
           }
           else{
               ide="";
               data.ide="";
     
           }*/
      requestController.preCancelRequestSocket(email_user, ide,
        function (err, socket_driver) {
          if (err) return cb(err);
          cb('OK');
          taxis.emit('precancel request', data);
          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);
                cb("OK");
              }
              else {
                cb('error');
              }
            });
        });
    }

    function precanceloferta(data, cb) {

      Request.findOneAndRemove({ _id: data.ide }, function (err, deleted) {
        if (err) return cb('error');
        // cb(null);
        cb('OK');
        taxis.emit('precancel request', data);
      });

    }

    function cancelrequest(data, cb) {
      var ide = data.ide;
      var sit = "cancel";
      //var email_driver = data.email_driver;
      //  console.log(email_driver);
      requestController.cancelRequestSocket(ide, sit,
        function (err, socket_driver) {
          if (err) return cb(err);
          cb('OK');
          Peticion.findOne({ idrequest: ide }, {}, function (err, pedir) {
                      //se envia el emit al taxista con un id especifico en el canal de taxis
          var send_data = {};
          console.log("---cancelado--")
          console.log(pedir)
          console.log("---cancelado--")
          send_data.email = pedir.email=="operador@"?"operador@":pedir.email;
          taxis.to(socket_driver).emit('cancel request', send_data);
          User.findOne({ email: pedir.email }, {}, function (err, miuser) {
            users.to(miuser.socketid).emit('getonboard');
          })
          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);
                cb("OK");
              }
              else {
                cb('error');
              }
            });
          });

        });
    }

    function finoperadoraequest(data, cb) {
      var ide = data.ide;
      var sit = "fin";
      //var email_driver = data.email_driver;
      //  console.log(email_driver);
      requestController.cancelRequestSocket(ide, sit,
        function (err, socket_driver) {
          if (err) return cb(err);
          cb('OK');
          //se envia el emit al taxista con un id especifico en el canal de taxis
          var send_data = {};
          send_data.email = "operador@";
          taxis.to(socket_driver).emit('Finalizado', send_data);
          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);
                cb("OK");
              }
              else {
                cb('error');
              }
            });
        });
    }

    function closeallop(cb) {

      Peticion.update({
        $and: [

          { email: 'operador@' },
          { situation: 2 }

        ]
      }, { situation: 4 }, { multi: true }, function (err, aff) {
        Peticion.update({
          $and: [

            { email: 'operador@' },
            { situation: 3 }

          ]
        }, { situation: 4 }, { multi: true }, function (err, aff) {
          Request.find({ email: 'operador@' }, {}, function (err, requests) {
            if (requests.length > 0) {
              requests.forEach(function (request, index, array) {
                var data = {}
                data.email = request.email;
                data.ide = request._id.toString();
                console.log(data.ide);
                console.log("id:" + data.ide);
                taxis.emit('precancel request', data);
                request.remove();
                console.log("removed");
              });
            }
            Peticion.update({
              $and: [

                { email: 'operador@' },
                { situation: 1 }

              ]
            }, { situation: 6 }, { multi: true }, function (err, aff) {
              requestController.mapupdatelist(
                function (err, lista) {
                  if (!err) {
                    mapa.emit('new request mapa', lista);
                    var send_data = {};
                    send_data.email = "operador@";
                    taxis.emit('cancel request', send_data);
                    cb("OK peticiones de la operadora finalizadas");
                  }
                  else {
                    cb('error');
                  }
                });
            });
          });
        })
      })
    }

    function newrequest(data, cb) {
      if (data.user == "WHATSAPP" && data.mykey != "ditec999") cb('error');
      else
        requestController.sendRequestSocket(data,
          function (err, request_data) {
            if (!err) {
              var send_data = {};

              if (data.tipomovil == "" || data.tipomovil == null) { send_data.tipomovil = "Cualquiera"; }
              else { send_data.tipomovil = data.tipomovil; }
              if (data.zona == null || data.zona == "") { send_data.zona = " -- "; }
              else { send_data.zona = data.zona; }

              send_data.latitude = data.latitude;
              send_data.longitude = data.longitude;
              send_data.latitudeB = 0;
              send_data.longitudeB = 0;
              send_data.note = data.note;
              send_data.email = data.email;
              send_data.address = data.address;
              send_data.gcm = 'gcm';
              send_data.name = request_data.name;
              send_data.phone = request_data.phone;
              send_data.promotion = request_data.promotion;
              send_data.to = data.to;
              send_data.id = request_data.id;
              send_data.generado = request_data.generado;
              send_data.tipopeticion = data.tipopeticion;
              send_data.socketiduser = socket.id;
              send_data.nrorequest = 1;
              // añadido para que funcione pasajero provisionalmente
              if (send_data.tipopeticion == undefined)
                send_data.tipopeticion = "normal";
              if (data.price == "") { send_data.price = 0; }
              else { send_data.price = data.price; }

              if (data.exactprice == "") { send_data.exactprice = 0; }
              else { send_data.exactprice = data.exactprice; }

              //se envia el emit a todos los socket conectados al canal de taxis
              send_data.coverage = 0.4;
              send_data.generado = request_data.generado;
              console.log("tipopeticion: " + send_data.tipopeticion);
              if (request_data.generado == "GOP1") {
                console.log("a uno");
                taxis.to(request_data.socketid).emit('new request', send_data, request_data, data.email);
              }
              else {

                console.log("a todos");
                console.log(data.zona);
                if (data.zona == null || data.zona == "" || data.zona == "Cualquiera") {

                  io.of('/taxis').emit('new request', send_data, request_data, data.email);
                  if (data.user == "WHATSAPP") {
                    io.of('/taxis').emit('new request whatsapp', send_data, request_data, data.email);
                    console.log("request de whatsapp detectado");
                  }
                  var intervalo;
                  clearInterval(intervalo);
                  intervalo = setInterval(function () {
                    Peticion.findOne({ 'idrequest': request_data.id })
                      .sort({ date: -1 })
                      .limit(1).exec(function (err, pedir) {
                        if (pedir != null)
                          if (pedir.situation < 2) {
                            var objectId = mongoose.Types.ObjectId(request_data.id);
                            Request.findById(objectId)
                              .sort({ date: -1 })
                              .limit(1).exec(function (err, request) {
                                if (request) {
                                  send_data.nrorequest = send_data.nrorequest + 1;
                                  send_data.coverage = send_data.coverage + 0.5;
                                  io.of('/taxis').emit('new request', send_data, request_data, data.email);
                                }
                                else {
                                  clearInterval(intervalo);
                                  pedir.situation = 6;
                                  pedir.save(function (err) {
                                    if (!err)
                                      requestController.mapupdatelist(
                                        function (err, lista) {
                                          if (!err) {
                                            mapa.emit('new request mapa', lista);
                                          }
                                        });
                                  });
                                }
                              });

                          }
                          else
                            clearInterval(intervalo);

                        else
                          clearInterval(intervalo);
                      });
                  }, 5000);
                }
                else {
                  taxis.to(data.zona).emit('new request', send_data, request_data, data.email);
                  var intervalo;
                  clearInterval(intervalo);
                  intervalo = setInterval(function () {
                    Peticion.findOne({ 'idrequest': request_data.id })
                      .sort({ date: -1 })
                      .limit(1).exec(function (err, pedir) {
                        if (pedir != null)
                          if (pedir.situation < 2) {
                            var objectId = mongoose.Types.ObjectId(request_data.id);
                            Request.findById(objectId)
                              .sort({ date: -1 })
                              .limit(1).exec(function (err, request) {
                                if (request) {
                                  send_data.coverage = send_data.coverage + 0.5;
                                  taxis.to(data.zona).emit('new request', send_data, request_data, data.email);
                                }
                                else {
                                  clearInterval(intervalo);
                                  pedir.situation = 6;
                                  pedir.save(function (err) {
                                    if (!err)
                                      requestController.mapupdatelist(
                                        function (err, lista) {
                                          if (!err) {
                                            mapa.emit('new request mapa', lista);
                                          }
                                        });
                                  });
                                }
                              });

                          }
                          else
                            clearInterval(intervalo);

                        else
                          clearInterval(intervalo);
                      });
                  }, 5000);
                }
              }
              requestController.mapupdatelist(
                function (err, lista) {
                  if (!err) {
                    //  console.log(lista[0].situacion+' + '+lista[1].situacion + ' + ' +lista[0].name + ' + '+lista[0].phone + ' + '+lista[0].situation);
                    mapa.emit('saveidupdate', lista, request_data);
                    //console.log(typeof request_data.id);
                    //console.log(request_data.id);
                    cb("OK", "" + request_data.id);
                  }
                  else {
                    cb('error');
                  }
                });
            }
            else {
              console.log("veamos error: " + err);
              if (err == 'Baneado') return cb('banned', "");
              if (err == 'Noexist') return cb('No existe el codigo de unidad');
              if (err == 'doblepasajero1') return cb("OK", "" + request_data.id);
              cb('error');
            }
          });
    }

    function soloanotar(data, cb) {

      requestController.soloanotar(data,
        function (err, request_data) {
          if (!err) {

            requestController.finanotar(request_data.id, data.coduni,
              function (err) {
                if (err) return cb(err);


                requestController.mapupdatelist(
                  function (err, lista) {
                    if (!err) {
                      //  console.log(lista[0].situacion+' + '+lista[1].situacion + ' + ' +lista[0].name + ' + '+lista[0].phone + ' + '+lista[0].situation);
                      mapa.emit('saveidupdate', lista, request_data);
                      //console.log(typeof request_data.id);
                      //console.log(request_data.id);
                      cb("OK", "" + request_data.id);
                    }
                    else {
                      cb('error');
                    }
                  });
              });
          }
          else {
            console.log(err);
            if (err == 'Baneado') return cb('banned');
            if (err == 'Noexist') return cb('No existe el codigo de unidad');
            cb('error');
          }
        });
    }

    function newrequestoferta(data, cb) {
      console.log("se ingreso a newrequestoferta");
      requestController.sendRequestSocketoferta(data,
        function (err, request_data) {
          console.log(err);

          if (!err) {
            var send_data = {};
            send_data.latitude = data.latitude;
            send_data.longitude = data.longitude;
            send_data.latitudeB = data.latitudeB;
            send_data.longitudeB = data.longitudeB;
            send_data.note = data.note;
            send_data.email = data.email;
            send_data.address = data.address;
            send_data.gcm = 'gcm';
            send_data.name = request_data.name;
            send_data.phone = request_data.phone;
            //
            // añadir socket.id en este ambito dado que se tiene su socket sin guardar en el modelo
            //
            send_data.socketiduser = socket.id;
            send_data.promotion = request_data.promotion;
            send_data.to = data.to;
            send_data.tipomovil = "Cualquiera";
            send_data.id = request_data.id;
            send_data.generado = "GAPP";
            // añadido para que funcione pasajero provisionalmente

            send_data.tipopeticion = "oferta";
            send_data.nrorequest = 10;

            send_data.price = data.price;

            send_data.exactprice = data.exactprice;

            //se envia el emit a todos los socket conectados al canal de taxis
            send_data.coverage = 5;
            console.log("datos de newrequestoferta");
            console.log(send_data);
            console.log("se envia emit a los taxistas");

            io.of('/taxis').emit('new request', send_data, request_data, data.email);
            cb("OK", "" + request_data.id);
          }
          else {
            console.log(err);
            if (err == 'Baneado') return cb('banned', "");
            if (err == 'Noexist') return cb('No existe el codigo de unidad');
            cb('error');
          }
        });
    }

    function aumentar(data, cb) {
      console.log("se ingreso a aumentar");
      console.log(data);
      User.findOne({ email: data.email }, {}, function (err, user) {
        if (!err) {
          var first_name = user.first_name;
          var last_name = user.last_name;
          var send_data = {};
          send_data.latitude = data.latitude;
          send_data.longitude = data.longitude;
          send_data.latitudeB = data.latitudeB;
          send_data.longitudeB = data.longitudeB;
          send_data.note = data.note;
          send_data.email = data.email;
          send_data.address = data.address;
          send_data.gcm = 'gcm';
          send_data.name = first_name + " " + last_name;
          send_data.phone = user.phone;

          send_data.socketiduser = socket.id;
          send_data.promotion = false;
          send_data.to = data.to;
          send_data.tipomovil = "Cualquiera";
          send_data.id = data.id;
          send_data.generado = "GAPP";
          send_data.tipopeticion = "oferta";
          send_data.nrorequest = 10;
          // añadido para que funcione pasajero provisionalmente


          send_data.price = data.price;

          send_data.exactprice = data.exactprice;

          //se envia el emit a todos los socket conectados al canal de taxis
          send_data.coverage = 5;
          console.log("datos de newrequestoferta");
          console.log(send_data);
          console.log("se envia emit aumento a los taxistas");

          io.of('/taxis').emit('new request', send_data, send_data, data.email);
          cb("OK", "" + data.id);
        }
        else {

          cb('error');
        }
      });



    }



    function saveop(data, cb) {
      UserCentral.findOne({ phone: data.phone }, {}, function (err, user) {                                                                        //console.log(request_data.id);
        if (err) return cb('error');
        if (!user) {
          var datausercentral = {};

          var new_otherAdress = [];
          var mynewaddress = {};
          mynewaddress.address = data.address;
          mynewaddress.note = data.note;
          mynewaddress.latitude = data.latitude;
          mynewaddress.longitude = data.longitude;
          new_otherAdress.push(mynewaddress);
          datausercentral.phone = data.phone;
          datausercentral.name = data.name;
          datausercentral.address = data.address;
          datausercentral.note = data.note;
          datausercentral.tipomovil = data.tipomovil;
          datausercentral.latitude = data.latitude;
          datausercentral.longitude = data.longitude;
          datausercentral.destino = data.to;
          datausercentral.precio = data.exactprice;
          datausercentral.zona = data.zona;
          datausercentral.otherAddress = new_otherAdress;
          var usercentral = new UserCentral(datausercentral);
          usercentral.save(function (err) {
            if (!err) {
              cb("OK");
            }
            else {
              return cb('error');
            }
          });
        }
        else {
          var query = { phone: data.phone };
          var datausercentral = {};
          datausercentral.phone = data.phone;
          datausercentral.name = data.name;
          datausercentral.address = data.address;
          datausercentral.note = data.note;
          datausercentral.tipomovil = data.tipomovil;
          datausercentral.latitude = data.latitude;
          datausercentral.longitude = data.longitude;
          datausercentral.destino = data.to;
          datausercentral.precio = data.exactprice;
          datausercentral.zona = data.zona;
          var existeaddress = 0;
          user.otherAddress.forEach(function (myaddress, index) {

            if (myaddress.address == data.address) {
              existeaddress = 1;
              if (myaddress.note != data.note)
                user.otherAddress[index].note = data.note;
              if (myaddress.latitude != data.latitude)
                user.otherAddress[index].latitude = data.latitude;
              if (myaddress.longitude != data.longitude)
                user.otherAddress[index].longitude = data.longitude;
            }
          });
          console.log(typeof (user.otherAddress));
          console.log(user.otherAddress.length);
          console.log("-----");
          console.log(user);
          console.log("------")
          if (data.RadioOA != "OA" && user.otherAddress.length > 0 && data.RadioOA == "Casa") {
            existeaddress = 1;
            user.otherAddress[0]["address"] = data.address;
            user.otherAddress[0].note = data.note;
            user.otherAddress[0].latitude = data.latitude;
            user.otherAddress[0].longitude = data.longitude;
          }
          if (data.RadioOA != "OA" && user.otherAddress.length > 1 && data.RadioOA == "Oficina") {
            existeaddress = 1;
            user.otherAddress[1]["address"] = data.address;
            user.otherAddress[1].note = data.note;
            user.otherAddress[1].latitude = data.latitude;
            user.otherAddress[1].longitude = data.longitude;
          }
          var new_otherAdress = user.otherAddress;
          if (existeaddress == 0) {

            var mynewaddress = {};
            mynewaddress.address = data.address;
            mynewaddress.note = data.note;
            mynewaddress.latitude = data.latitude;
            mynewaddress.longitude = data.longitude;
            new_otherAdress.push(mynewaddress);

          }
          datausercentral.otherAddress = new_otherAdress;
          UserCentral.findOneAndUpdate(query, datausercentral, "", function (err, userupdate) {
            //      console.log("Se actualizo usercentral");
            cb('OK');
          });
        }
      });
    }


    function deleteaddress(data, cb) {
      console.log(data);
      UserCentral.findOne({ phone: data.phone }, {}, function (err, user) {                                                                        //console.log(request_data.id);
        if (err) return cb('error');
        if (user) {
          var query = { phone: data.phone };
          var datausercentral = {};
          user.otherAddress.forEach(function (myaddress, index) {
            if (myaddress.address == data.address) {
              user.otherAddress.splice(index, 1);
            }
          });
          //var new_otherAdress = user.otherAddress;          
          datausercentral.otherAddress = user.otherAddress;
          UserCentral.findOneAndUpdate(query, datausercentral, "", function (err, userupdate) {
            //      console.log("Se actualizo usercentral");
            cb('OK');
          });
        }
        else {
          return cb('no existe el numero');
        }
      });
    }

    function saveRecordatorio(data, cb) {
      var datarecordatorio = {};
      datarecordatorio.hora = data.hora;
      datarecordatorio.fecha = data.fecha;
      datarecordatorio.dias = data.dias;
      datarecordatorio.recordatorio = data.recordatorio;
      var myid = null;
      var recordatorio = new Recordatorio(datarecordatorio);
      recordatorio.save(function (err, idreq) {
        if (!err) {
          myid = idreq._id.toString();
          console.log(myid);
          var hora = "*";
          var minuto = "*";
          var dia = "*";
          var mes = "*";
          var dias = "*";
          if (data.hora != "") {
            hora = parseInt(data.hora.substring(0, 2));
            minuto = parseInt(data.hora.substring(3));
          }
          if (data.fecha != "") {
            dia = parseInt(data.fecha.substring(8));
            mes = parseInt(data.fecha.substring(5, 7)) - 1;
          }
          if (data.dias != "")
            dias = data.dias;

          /*  console.log(myid);
        console.log("* "+minuto+" "+hora+" "+dia+" "+mes+" "+dias);*/
          var job = new CronJob(minuto + " " + hora + " " + dia + " " + mes + " " + dias, function () {

            Recordatorio.findOne({ _id: myid }, {}, function (err, record) {
              if (record) {
                mapa.emit('startremember', data.recordatorio);
                console.log("iniciando recordatorio");
              }
              else {
                console.log("se ha eliminado el recordatorio");
                job.stop();
              }

            });


          }, function () {
            console.log("recordatorio finalizado");
          },
            true,
            'America/Lima'
          );
          cb("OK");
        }
        else {
          return cb('error');
        }
      });


    }

    function signin(email, cb) {
      //busca un usuario con el email y actualiza el campo socket.id con el de la
      // ultima conexion realizada al canal
      console.log(email);
      if (email == "operador@") socket.email = email;
      else
        User.findOne({ email: email }, {}, function (err, user) {
          if (!user) {
            console.log("no se encontro el pasajero")
            return cb('error');
          }
          socket.email = email;
          user.socketid = socket.id;
          user.save(function (err) {
            if (err) {
              console.log("hubo un error al guardar el id del signin pasajero")
              return cb('error')
            };
            console.log("se guardo correctamente");
            if (email == "operador@") {
              /*          Recordatorio.find({}, {},function(err,records){
                          if (records) 
                          {
                            //console.log("existen records")
                            //corrigiendo recordatorio
                            for(i=0;i<records.length-1;i++)
                            {
                              myid= records[i]._id.toString();
                            //  console.log(myid);
                              var hora="*";
                              var minuto="*";
                              var dia="*";
                              var mes="*";
                              var dias="*";
                              if(records[i].hora!="")
                              {
                                hora=parseInt(records[i].hora.substring(0,2));
                                minuto=parseInt(records[i].hora.substring(3));
                              }
                              if(records[i].fecha!="")
                              {
                                dia=parseInt(records[i].fecha.substring(8));
                                mes=parseInt(records[i].fecha.substring(5,7))-1;
                              }
                              if(records[i].dias!="")
                                dias=records[i].dias;
              
                              var job = new CronJob(minuto+" "+hora+" "+dia+" "+mes+" "+dias, function() {
              
                                Recordatorio.findOne({_id: myid},{},function(err, record){
                                  if(record)
                                  {
                                    mapa.emit('startremember',records[i].recordatorio);
                                    console.log("iniciando recordatorio");
                                  } 
                                  else
                                  {
                                    console.log("se ha eliminado el recordatorio");
                                    job.stop();
                                  }
              
                                });
              
              
                              }, function () {
                                console.log("recordatorio finalizado");
                              },
                              true,
                              'America/Lima'
                              );
                            }
                          }
                        });*/
            }
            console.log("se finalizo el signin")
            cb('OK', socket.id);
          })
        });
    }
  });

  taxis.on('connection', function (socket) {
    numtaxistas = numtaxistas + 1;
    console.log("se conecto el id: " + socket.id + " numtaxistas: " + numtaxistas);
    var datataxi = {};
    datataxi.inrequest = "";
    // console.log("un taxista se conecto");

    //al conectarse un nuevo usuario, emito el evento 'connected'
    socket.emit('connected');

    //envia un notificacion al usuario para que suena la bocina
    socket.on('arrive', arrive);

    //envia notificacion de emergencia a todos los taxistas
    socket.on('emergency', emergency);

    //envia un emit cuando el taxista termina la carrera (no se usa)
    socket.on('getonboard', getonboard);

    //envia un emit al usuario cuando un taxista acepta un pedido
    socket.on('accept', accept);

    //actualiza el socket id del taxista cada vez que se conecta al canal de
    // sockets de taxis
    socket.on('signin', signin);

    //envia la localizacion constante del taxi a un usuario especifico
    socket.on('taxi location', sendlocation);

    socket.on('sendsituation', sendsituation);

    //para la radio virtual indicar que pulse el micro
    socket.on('sendChangeSituationMic', sendChangeSituationMic);

    //Para los mensajes
    socket.on('message', socketmessage);

    socket.on('MessageToCentral', socketmessagetocentral);

    socket.on('aceptaroferta', aceptaroferta);

    socket.on('retiraroferta', retiraroferta);
    //
    //para pedir las posiciones de los taxistas
    socket.on('pactualizar', pediractualizar);
    socket.on('pborrarpeticiones', borrarpeticiones);

    socket.on('send map', Monitoreo);
    socket.on('ontravel', ontravel);
    socket.on('finanotar', finanotar);
    socket.on('savemylocationsaccept', savemylocationsaccept);
    socket.on('savemylocationstravel', savemylocationstravel);

    socket.on('disconnect', function () {
      //añadido para informar al mapa que se desconecto un taxista (sin internet, cerrado el servicio o apagado el cel)
      //console.log("Un taxista se desconecto con email: "+ socket.email + " y socket: "+ socket.id);
      if (datataxi.ubication == 1) {
        // console.log("el valor de data.email es:"+data.email_user+ " su ultima latitud es: "+data.latitude+" su ultima longitud es:"+data.longitude);
        datataxi.disconnected = true;
        mapa.emit('ubication', datataxi);

      }
      console.log("se desconecto el id: " + socket.id + " taxista: " + datataxi.email + " socket.email:" + socket.email);
      delete socket;
      numtaxistas = numtaxistas - 1;
      console.log("El numero de taxistas es: " + numtaxistas);
      // almacenando la desconexion
      /*  socket.emit('disconnected');
         User.findOne({email:socket.email},{},function(err, user){
          if(!user) return cb('error');
          
          user.connected = false;
          user.save(function(err){
            //if(err) return cb('error');
            //cb('OK');
            //// /
            //socket.emit('successful');
          })
        });*/
      //    
    });

    function savemylocationsaccept(email, id, mylocations, cb) {
      /*console.log("savemylocationsrequest");
      console.log(email);
      console.log(id);
      console.log(mylocations);*/
      var query = { idrequest: id };
      var update = {};
      update.ubicationaccept = mylocations;
      Peticion.findOneAndUpdate(query, update, "", function (err, aff) {

      });
    }
    function savemylocationstravel(email, id, finishrequest, mylocations, latitude, longitude, cb) {
      /*console.log("savemylocationsrequest");
      console.log(email);
      console.log(id);
      
      console.log(finishrequest);*/

      var query = { idrequest: id };
      var update = {};
      update.ubicationtravel = mylocations;
      if (finishrequest == 1) {
        update.latitudfinish = latitude;
        update.longitudfinish = longitude;
        update.datefinish = new Date();
      }

      Peticion.findOneAndUpdate(query, update, "", function (err, aff) {


      });
    }


    function sendlocation(email_user, latitude, datalocation, cb) {
      var data = {};
      data.latitude = latitude;
      if ((typeof datalocation) == "number")
        data.longitude = datalocation;
      else {
        data.longitude = datalocation.lon;
        data.bearing = datalocation.bearing;
        //console.log(data.bearing);
      }
      data.email_user = email_user;

      if (email_user != "operador@") {
        requestController.sendLocationDriverSocket(email_user,
          function (err, socket_user) {

            if (err) return cb(err);
            cb('OK');
            //envia el emit a un usuario especifico
            //console.log("enviamos posicion");
            //console.log("al usuario: "+email_user+ " con socket.id: "+socket_user);
            users.to(socket_user).emit('taxi location', data);
            //reenvio al canal de mapa
            // io.of('/mapa').emit('ubication',data);
          });
      }
      else
        cb('OK');
    }
    /*
    checkinformation para que informe un cambio inmediatamente cuando ocurre tanto si cambia de sin servicio a con servicio, ocupado a desocupado, emergencia
    */
    function Monitoreo(email, ocupado, inrequest, latitude, longitude, cb) {
      // console.log("se recibio una ubicacion");
      datataxi.latitude = latitude;
      datataxi.longitude = longitude;
      datataxi.email = email;
      datataxi.inrequest = inrequest;
      datataxi.ubication = 1;
      datataxi.disconnected = false;
      datataxi.email_user = email;
      if ((typeof ocupado) == "boolean") {
        datataxi.ocupado = ocupado;
      }
      else {
        datataxi.ocupado = ocupado.ocupado;
        datataxi.emergency = ocupado.emergency;
        //se emitiria al socket de taxi  
        if (datataxi.emergency)
          taxis.emit('ubicationalarma', datataxi);
      }

      mapa.emit('ubication', datataxi);
      //se emite el pulso a todos los taxistas con el marcador ubicationsupervisor para discriminar
      taxis.emit('ubicationsupervisor', datataxi);

    }

    function sendsituation(situation, cb) {
      // console.log("se recibio una ubicacion");

      datataxi.email = situation.email;
      datataxi.ubication = 1;
      datataxi.disconnected = false;
      datataxi.ocupado = situation.ocupado;
      datataxi.inrequest = situation.inrequest;
      datataxi.servicioc = situation.servicioc;
      datataxi.sospechoso = situation.sospechoso;
      datataxi.latitude = situation.latitude;
      datataxi.longitude = situation.longitude;
      mapa.emit('ubication', datataxi);
      //se emite el pulso a todos los taxistas con el marcador ubicationsupervisor para discriminar
      taxis.emit('ubicationsupervisor', datataxi);
      if (!situation.inrequest && datataxi.inrequest1) {

        Request.findOne({ 'email_driver': situation.email })
          .sort({ date: -1 })
          .limit(1).exec(function (err, request) {
            if (request) {
              console.log("caso extraño de finalizacion sin actualizar a la central")
              myide = request._id;
              Request.findOneAndRemove({ _id: myide }, function (err, deleted) {
                var query = {};
                query.idrequest = myide;
                var update = {};
                update.situation = 4;
                var options = {};
                options.safe = true;
                options.upsert = true;

                Peticion.findOneAndUpdate(query, update, options, function (err, peticion) {
                  //checksit
                  console.log(peticion);
                  if (!err) {
                    requestController.mapupdatelist(
                      function (err, lista) {
                        if (!err) {
                          mapa.emit('new request mapa', lista);

                          cb("OK");
                        }
                        else {
                          cb('error');
                        }
                      });
                    datataxi.inrequest1 = situation.inrequest;
                  }

                });
              });
            }
          });
      }
      else
        datataxi.inrequest1 = situation.inrequest;
      // mapa.emit('emergency',datataxi.email);
    }

    function sendChangeSituationMic(situation, cb) {
      if (situation.email) {
        mapa.emit('changeSituationRadioMic', situation);
        taxis.emit('receiveChangeSituationRadioMic', situation);
      }
      //mapa.emit('ubication',datataxi);
      //se emite el pulso a todos los taxistas con el marcador ubicationsupervisor para discriminar
      //taxis.emit('ubicationsupervisor',datataxi);
      // mapa.emit('emergency',datataxi.email);
    }

    //se añade emergency para emitir la alarma al canal de taxi
    function emergency(user, cb) {
      //se usara este controlador solo para validar existencia del taxista
      //console.log(user.valor)
      if (datataxi != null) {
        datataxi.valor = user.valor;
        requestController.saveemergency(datataxi, function (err) {
          if (err) return cb(err);
          //envia el emit a un usuario especifico en el canal de usuarios
          //console.log(user.email);
          //console.log(typeof user.email);
          if (user.valor == 1) {
            //console.log("alarma activada");
            taxis.emit('emergency', user);
            mapa.emit('emergency', user.email);
            datataxi.emergency = true;
            mapa.emit('ubication', datataxi);

            var finemergency = new Date(moment(new Date()).add(1, 'Hours'));
            new CronJob(finemergency, function () {
              var update_field = {};
              update_field.estadoalarma = 0;
              var query = { email: user.email };
              User.update(query, update_field, {}, function (err, raw) {
                if (err) return console.log(err);
              });

            }, function () {
              console.log("se actualizo el estadoalarma satisfactoriamente para : " + user.email);

            }, true, 'America/Lima');


            cb('OKenabled');
          }
          else {
            datataxi.emergency = false;
            mapa.emit('ubication', datataxi);
            // console.log("alarma desactivada");
            cb('OKdisabled');
          }
        });
      }
    }


    function accept(email_user, email_driver, ide, cb) {

      requestController.acceptRequestSocket(email_user, email_driver, ide,
        function (err, data_driver, socket_user) {
          if (err) return cb(err);
          cb('OK');
          var data = {};
          data.email = email_user;
          //enviamos el email del taxista para filtrarlo con la app de la operadora y no borrar su petición
          data.emaildriver = email_driver;
          data.ide = ide;
          socket.broadcast.emit('taken', data);
          // taxis.emit('taken',data);
          //envia el emit a un usuario especifico en el canal de usuarios
          users.to(socket_user).emit('accept', data_driver);
          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);
                Peticion.findOne({ idrequest: ide })
                  .sort({ date: -1 })
                  .limit(1).exec(function (err, pedir) {
                    if (err) return cb(err);
                    if (!pedir) {
                      console.log("error ide no encontrado");
                      cb('error');
                    }
                    console.log("datos del request para whatsapp");
                    console.log(pedir);
                    console.log("datos del taxista para whatsapp");
                    console.log(data_driver);
                    if (pedir.generado == "GWAPP")
                      io.of('/taxis').emit('accept whatsapp', pedir, data_driver);
                    cb("OK");
                  });

              }
              else {
                cb('error');
              }
            });
          //console.log(socket_user);

        });
    }

    function getonboard(ide, cb) {

      requestController.getOnBoardSocket(ide,
        function (err, socket_user) {
          if (err) return cb(err);
          //envia el emit a un usuario especifico en el canal de usuarios
          users.to(socket_user).emit('getonboard');
          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);
                cb("OK");
              }
              else {
                cb('error');
              }
            });
        })
    }

    function ontravel(ide, coduni, cb) {

      requestController.ontravel(ide, coduni,
        function (err, socket_user) {
          if (err) return cb(err);
          //envia el emit a un usuario especifico en el canal de usuarios
          users.to(socket_user).emit('ontravel');

          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);
                cb("OK");
              }
              else {
                cb('error');
              }
            });
        })
    }

    function finanotar(ide, coduni, cb) {
      var data = {};
      data.email = coduni;
      data.ide = ide;
      taxis.emit('taken', data);
      requestController.finanotar(ide, coduni,
        function (err) {
          if (err) return cb(err);

          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);
                cb("OK");
              }
              else {
                cb('error');
              }
            });
        })
    }



    function arrive(user, cb) {
      requestController.arriveSocket(user.email, function (err, socket_user) {
        if (err) return cb('error', err.message);
        //envia el emit a un usuario especifico en el canal de usuarios
        users.to(socket_user).emit('arrive', user);
        cb('OK', user.email);
      });
    }

    function socketmessage(data, cb) {

      console.log(data);
      if (data.tipomessage == "all") {
        taxis.emit('mensajecentral', data);
        cb('OK');
      }
      else {
        requestController.arriveSocket(data.email_driver, function (err, socket_user) {
          if (err) return cb('error', err.message);
          //envia el emit a un usuario especifico en el canal de usuarios
          taxis.to(socket_user).emit('mensajecentral', data);

          cb('OK');
        });
      }
    }

    function pediractualizar(data, cb) {

      if (data.email == "operador@") {
        taxis.emit('pactualizar', data);
        cb('OK');
      }
      else {
        cb('error');
      }
    }

    function borrarpeticiones(data, cb) {
      console.log("eliminando peticiones");

      if (data.email == "operador@") {

        Peticion.find({
          $or: [

            { situation: 4 },
            { situation: 5 },
            { situation: 6 },
          ]
        }, {}, function (err, temps) {
          if (temps.length > 0) {

            temps.forEach(function (temp, index, array) {
              temp.remove();
            });
          }
          console.log("ya dentro ");
          requestController.mapupdatelist(
            function (err, lista) {
              if (!err) {
                mapa.emit('new request mapa', lista);
                cb("OK");
              }
              else {
                cb('error');
              }
            });
        });


      }
      else {
        cb('error');
      }
    }

    function socketmessagetocentral(data, cb) {


      /* requestController.arriveSocket("operadortaxi@",function(err,socket_user){
       if(err) {
          console.log(err);
         return cb('error',err.message);}*/
      console.log(data);
      //envia el emit a un usuario especifico en el canal de usuarios
      taxis.emit('messagetocentral', data);
      cb('OK');
      // });

    }

    function aceptaroferta(data, cb) {

      User.findOne({'email': data.email_driver},{},function(err,taxi){
        if(err) return cb(err);
        else if(!taxi) return cb('notExist');
        else if(taxi.credit==0) return cb('notCredit');
        else if(taxi.saldoCarreras==0) return cb('notSaldo');        
        cb('OK');
        
        data.image = datataxi.image;
        data.dni = datataxi.dni;
        data.phone = datataxi.phone;
        data.autoplate = datataxi.autoplate;
        data.car_model = datataxi.car_model;
        data.car_type = datataxi.car_type;
        data.car_color = datataxi.car_color;
        data.name = datataxi.name;
        data.socketidtaxi = socket.id;
        console.log(data);
        users.to(data.socketiduser).emit('propuestataxista', data);


      })

    }

    function retiraroferta(data, cb) {

      users.to(data.socketiduser).emit('retirarofertataxista', data);

    }

    function signin(params, cb) {

      if (typeof (params) == "string") {
        console.log("Signin version antigua de: " + params);
        User.findOne({ email: params }, {}, function (err, user) {
          version = {};
          if (user != null)
            version.version_code = user.versionnumber + 1;


          taxis.to(socket.id).emit('newversion', version);
          cb('OK');
          socket.disconnect(true);
        });
      }
      else
        if (params.email_driver == "operadortaxi@") cb('OK');
        else {
          console.log("old: " + datataxi.email + " email_driver: " + params.email_driver + " con: " + params.connect + " Ver: " + params.myversion + " Android: " + params.Android);
          if (datataxi.email == params.email_driver && params.connect != "newsignin") {
            console.log("Signin innecesario de: " + params.email_driver);
            cb('OK');
          }
          else {
            // console.log("Signin version nueva de: "+params.email_driver);
            //busca al taxista por su email y actualiza su socket id      
            User.findOne({ email: params.email_driver }, {}, function (err, user) {
              if (!user) return cb('error');
              socket.email = params.email_driver;
              datataxi.email = params.email_driver;
              datataxi.latitude = 0;
              datataxi.longitude = 0;
              datataxi.email_user = params.email_driver;
              user.socketid = socket.id;
              user.versionnumber = params.myversion;
              user.versionandroid = params.Android;
              user.lastconnection = new Date();
              //para acceder a mas datos del taxista
              datataxi.image = user.photo_profile;
              datataxi.autoplate = user.autoplate;
              datataxi.dni = user.dni;
              datataxi.phone = user.phone;
              datataxi.name = user.first_name + " " + user.last_name;
              datataxi.car_model = user.car_model;
              datataxi.car_type = user.car_type;
              datataxi.car_color = user.car_color;
              if (user.credit == 0) { taxis.to(user.socketid).emit('expulsado'); cb('OK'); }
              /*        else if(params.Android==undefined)  {
                        console.log("Version Antigua no indica Version de Android")
                        version={};
                        version.version_code=user.versionnumber+1;
                        taxis.to(socket.id).emit('newversion',version);
                        cb('OK');
                        socket.disconnect(true);}*/
              else
                user.save(function (err) {
                  if (err) return cb('error');
                  var grupodefecto = user.groupdefault;
                  datataxi.grupodefecto = grupodefecto;
                  var grupo2 = user.grupo2;
                  var grupo3 = user.grupo3;
                  var sexo = user.sexo;
                  var tipocarro = user.car_model;
                  socket.join(grupodefecto, function () {
                    // console.log("se ingreso al grupo: " +grupodefecto);
                  });
                  socket.join(grupo2, function () {
                    // console.log("se ingreso al grupo: " +grupodefecto);
                  });
                  socket.join(grupo3, function () {
                    // console.log("se ingreso al grupo: " +grupodefecto);
                  });
                  socket.join(sexo, function () {
                    // console.log("se ingreso al grupo: " +grupodefecto);
                  });
                  socket.join(tipocarro, function () {
                    // console.log("se ingreso al grupo: " +grupodefecto);
                  });
                  if (params.myversion >= versionserver.version_code) {
                    cb('OK');
                  }
                  else {
                    taxis.to(user.socketid).emit('newversion', versionserver);
                    cb('OK');
                  }




                  //// /
                  //socket.emit('successful');
                })
            });
          }
        }
    }

  });

  //cada vez que un socket se desconecta envia un emit al mismo socket para
  //saber que esta desconectado


  return module;

};

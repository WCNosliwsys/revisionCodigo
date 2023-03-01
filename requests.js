
var gcm = require('node-gcm');
var _ = require('lodash');
var Request = require('../models/request');
var Peticion = require('../models/peticiontemp');
var PeticionBD = require('../models/peticion');
var Costxdistance = require('../models/costxdistance');
var Situation = require('../models/situation')
var config = require('../../config/libraries');
var User = require('../models/user');
var UserWhatsApp = require('../models/userwhatsapp');
var AdminCosto = require('../models/admincosto');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var moment = require('moment-timezone');
var async = require('async');
var CronJob = require('cron').CronJob;
var transport = nodemailer.createTransport(smtpTransport(config.email.servicios));
var transport2 = nodemailer.createTransport(smtpTransport(config.email.noreply));
var gcmSender = _.once(function () { return new gcm.Sender(config.gcm.apiKey); });
var smsup = require('./smsup');
var TMClient = require('textmagic-rest-client');
var infobip = require('./infobip');
var UserCentral = require('../models/usercentral');

module.exports.acceptRequestSocket = function (email_user, email_driver, ide, cbsocket) {
  async.waterfall([
    function noCredit(cb) {
      //console.log('ingresamos al acceptRequestSocket');

      AdminCosto.findOne({ myId: "adminCosto" }, function (err, MiCosto) {
        if(err) return cb(err);
        Peticion.findOne({ idrequest: ide }, function (err, pedir) {
          let costo = pedir.exactprice == 0 ? MiCosto.costo_fijo : pedir.exactprice * MiCosto.porcentaje / 100
          User.findOne({ 'email': email_driver }, {}, function (err, taxi) {
            if (err) return cb(err);
            else if (!taxi) return cb(new Error('No existe el taxista'));
            else if (taxi.credit == 0) return cb(new Error('EL taxista no tiene saldo'));
            else if (taxi.saldoCarreras-costo < 0) return cb(new Error('Sin saldo'));
            else cb(null, taxi);
          })
        });

      });

    },

    function findRequest(taxi, cb) {
      Request.findOne({ _id: ide }, {}, function (err, req) {
        if (err) return cb(err);
        if (!req) {
          console.log("salvado");
          return cb(new Error("no existe"));
        }
        email_user = req.email;
        cb(null, taxi, req)
      });
    },

    function updateRequest(taxi, request, cb) {
      //console.log(request);
      if (!request) return cb(new Error("no existe"));
      if (request.state) return cb(new Error("ya esta tomado"));
      // en ves de usar update field se puede usar el .save()
      var update_fields = {};
      update_fields.state = true;
      update_fields.email_driver = email_driver;
      update_fields.situation = 2;
      if (email_driver == 'operadortaxi@')
        update_fields.aceptado = 'AOP';
      else
        update_fields.aceptado = 'AAPP';
      //faltaria hacer la busqueda por el id del request para ello se debera añadir el id a la peticion cuando se genera el request
      Peticion.findOne({ idrequest: ide })
        .sort({ date: -1 })
        .limit(1).exec(function (err, pedir) {
          if (pedir.email_driver == "-") {
            console.log("peticion normal");

            Peticion.findByIdAndUpdate(
              pedir._id, update_fields, {},
              function (err, numberAffected, raw) {
                Request.update({ _id: ide }, update_fields, {},
                  function (err, numberAffected, raw) {
                    cb(err, taxi);
                  });
              });
          }
          else {
            console.log(pedir);
            console.log("yo lo intente:" + email_driver);

            console.log("INTENTO DOBLE PETICION");
            return cb(new Error("ya esta tomado"));
          }
        });

    },

    function getOneDriver(taxi, cb) {
      var data_taxi = {};
      data_taxi.email = taxi.email;
      data_taxi.phone = taxi.phone;
      data_taxi.autoplate = taxi.autoplate;
      data_taxi.image = taxi.photo_profile;
      data_taxi.dni = taxi.dni;
      data_taxi.company = taxi.company;
      data_taxi.car_brand = taxi.car_brand;
      data_taxi.car_model = taxi.car_model;
      data_taxi.car_color = taxi.car_color;
      data_taxi.car_type = taxi.car_type;
      data_taxi.gcm_driver = taxi.gcm_id;
      data_taxi.name = taxi.first_name + " " + taxi.last_name;
      cb(null, data_taxi)

    },


    function getUser(data_taxi, cb) {
      User.findOne({ 'email': email_user }, {}, function (err, user) {
        if (err) return cb('error');
        if (!user) return cb(new Error('No existe el usuario'));
        cb(null, data_taxi, user.socketid);
      });
    }

  ], function (err, data_taxi, socket_user) {
    if (err) {
      if (err.message == 'EL taxista no tiene saldo') return cbsocket('nocredit');
      if (err.message == 'Sin saldo') return cbsocket('noSaldo');
      if (err.message == 'ya esta tomado') return cbsocket('taked');
      if (err.message == 'no existe') return cbsocket('notexist');
      return cbsocket('error');
    }

    cbsocket(null, data_taxi, socket_user);
  });
};

//aun corrigiendo el accept
module.exports.acceptOfertaSocket = function (data, cbsocket) {
  async.waterfall([

    function updateRequest(cb) {
      var update_fields = {};
      update_fields.state = true;
      update_fields.email_driver = data.email_driver;
      update_fields.situation = 2;
      update_fields.exactprice = data.price
      update_fields.price = data.price
      Request.findOneAndUpdate({ _id: data.ide }, update_fields, { new: true },
        function (err, req) {
          cb(err, req);
        });
    },

    function createpeticion(req, cb) {
      var requestData = {};
      requestData.situation = 2;
      requestData.address = req.address;
      requestData.email = req.email;
      requestData.email_driver = req.email_driver;
      requestData.state = req.state;
      requestData.promotion = req.promotion;
      requestData.dateontravel = req.dateontravel;
      requestData.efectivo = req.efectivo;
      requestData.gcm_id = req.gcm_id;
      requestData.gcm_driver = req.gcm_driver;
      requestData.latitude = req.latitude;
      requestData.longitude = req.longitude;
      requestData.tipomovil = req.tipomovil;
      requestData.zona = req.zona;
      requestData.name = req.name;
      requestData.idrequest = req._id.toString();
      requestData.phone = req.phone;
      requestData.to = req.to;
      requestData.price = data.price;
      requestData.exactprice = data.price;
      requestData.date = req.date;
      requestData.note = req.note;
      requestData.generado = 'GAPP';
      requestData.aceptado = 'AAPP';
      var peticion = new Peticion(requestData);
      peticion.save(function (err) {
        return cb(null, requestData);
      });
    }

  ], function (err, requestData) {
    if (err) {
      return cbsocket('error');
    }

    cbsocket(null, requestData);
  });
};

module.exports.preCancelRequestSocket = function (email, ide, cb) {
  /*if(email=="operador@"){*/
  var update = {};
  update.situation = 6;
  Peticion.findOneAndUpdate({ idrequest: ide }, update, { new: true }, function (err, pedir) {
    if (pedir) {
      //checksit             

      Request.findOneAndRemove({ _id: ide }, function (err, deleted) {
        if (err) return cb('error');
        // cb(null);
        var peticionbdcopy = clonpeticion(pedir);

        var peticionbd = new PeticionBD(peticionbdcopy);
        peticionbd.save(function (err) {
          console.log(err);
          return cb(null);
        });
      });

    }
    else
      return cb('error');

  });

  /*   }
    else{
      var update = {};       
      update.situation=6;
      Peticion.findOne({'email': email})
          .select('_id')
          .sort({date:-1})
          .limit(1).exec(function(err,pedir){
              Peticion.findByIdAndUpdate(pedir._id, update, {}, function (err, aff) {
                 //checksit
                 aff.situation=6;              
                  Request.findOneAndRemove({'email': email}, function(err,deleted) {
                    if(err) return cb('error');
                      var peticionbdcopy=clonpeticion(aff);
                    // var peticionbdcopy=JSON.parse(JSON.stringify(aff));
                     // delete peticionbdcopy._id;
                    var peticionbd= new PeticionBD(peticionbdcopy);
                            peticionbd.save(function (err) {
                              console.log(err);                           
                              return cb(null);
                            });
                  });
              });
          });
    }  */
};

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

module.exports.checkAccept = function (req, res) {
  Request.findOne({ email: req.body.email }, {}, function (err, request) {
    if (!request) return res.sendStatus(503);
    if (!request.state) return res.sendStatus(503);
    User.findOne({ email: request.email_driver }, {}, function (err, driver) {
      var driver_info = {};
      driver_info.phone = driver.phone;
      driver_info.autoplate = driver.autoplate;
      driver_info.image = driver.photo_profile;
      driver_info.dni = driver.dni;
      driver_info.company = driver.company;
      driver_info.car_brand = driver.car_brand;
      driver_info.car_model = driver.car_model;
      driver_info.car_type = driver.car_type;
      driver_info.car_color = driver.car_color;
      driver_info.gcm_driver = driver.gcm_id;
      driver_info.name = driver.first_name + " " + driver.last_name;
      driver_info.email = driver.email;
      res.json(driver_info);
    })
  })
};

module.exports.checkEnableWhatsapp = function (req, res) {
  var query = { phone: req.body.phone };
  UserWhatsApp.findOne(query, {}, function (err, userWhatsapp) {
    if (err) return res.sendStatus(503);
    console.log("enviado userwhatsapp");
    res.status(200).send(userWhatsapp);;
  });
};

module.exports.updateToken = function (req, res) {
  var query = { phone: req.body.phone };
  var update = {}
  if (req.body.chatTokenWeb)
    update.chatTokenWeb = "";
  if (req.body.chatTokenPedir)
    update.chatTokenPedir = "";

  UserWhatsApp.findOneAndUpdate(query, update, "", function (err, userWhatsapp) {
    if (err) return res.sendStatus(503);
    console.log("enviado userwhatsapp");
    res.status(200).send(userWhatsapp);
  });
};

module.exports.updateDataUserWhatsapp = function (req, res) {
  var query = { phone: req.body.phone };
  console.log(req.body);
  var update = req.body;

  UserWhatsApp.findOneAndUpdate(query, update, "", function (err, userWhatsapp) {
    if (err) return res.sendStatus(503);
    console.log("enviado userwhatsapp");
    res.status(200).send(userWhatsapp);
  });
};


module.exports.checkRequest = function (req, res) {
  var query = { email: req.body.email };
  Request.findOne(query, {}, function (err, request) {
    if (err || request) return res.sendStatus(503);
    res.sendStatus(200);
  });
};

module.exports.checkRequesttaxi = function (req, res) {
  var ide = "";

  if (req.body.ide == "" || req.body.ide == null) {
    console.log("antigua version de checktaxi");
    var query = { email_driver: req.body.email };
    Request.findOne(query, {}, function (err, request) {
      if (err || request) return res.sendStatus(503);
      res.sendStatus(200);
    });
  }
  else {
    console.log("nueva version de checktaxi");
    ide = req.body.ide;
    console.log(ide);
    Request.findOne({ _id: ide })
      .sort({ date: -1 })
      .limit(1).exec(function (err, request) {
        if (err) res.sendStatus(503);
        if (request) {
          if (request.email_driver == req.body.email)
            res.status(200).send({ msg: 2 });//si corresponde para el conductor
          else
            return res.status(200).send({ msg: 1, ontravel: request.ontravel });//otro conductor lo tomo
        }
        else {
          console.log("no hay request nueva version");
          res.status(200).send({ msg: 0 });//el request ya no existe
        }
      });


  }
};

module.exports.checkRequeststate = function (req, res) {
  Request.findOne({ email: req.body.email }, {}, function (err, request) {
    // Request.findOne(query, {}, function(err,respuesta){
    if (!request) { return res.sendStatus(500); }
    else if (request.ontravel == true) { return res.sendStatus(200); }
    else { return res.sendStatus(503); }

    //if(respuesta.status==true) return res.sendStatus(503);
  });
};


module.exports.sendRequestSocket = function (data, cbsocket) {

  console.log("usuario", data.user);
  var latitude = data.latitude;
  var longitude = data.longitude;
  var note = data.note;
  var email = data.email;
  var gcm = data.gcm;
  var address = data.address;
  var to = data.to;
  var price = data.price;
  var exactprice = data.exactprice;
  var phone = data.phone;
  var name = data.name;
  var tipomovil = "";
  var zona = "";
  var email_driver = "";
  if (!(data.email_driver == "" || data.email_driver == null))
    email_driver = data.email_driver;

  if (data.tipomovil == "" || data.tipomovil == null)
    tipomovil = "Cualquiera";
  else
    tipomovil = data.tipomovil;
  if (data.zona == null) { zona = " -- "; }
  else { zona = data.zona; }
  async.waterfall([

    function getUser(cb) {
      if (email == 'operador@') cb(null, email);
      else {
        User.findOne({ email: email }, {}, function (err, user) {
          if (err) return cb(err);
          if (!user) return cb(new Error("no existe el usuario"));
          cb(null, user);
        });
      }
    },

    function sendUserData(user, cb) {
      if (email == 'operador@') {
        if (!(email_driver == "" || email_driver == null)) {

          User.findOne({ email: email_driver }, {}, function (err, user) {
            if (err) return cb(new Error('Noexist'));
            if (!user) return cb(new Error('Noexist'));

            cb(null, user);
            // });

          });
        }
        else {

          cb(null, email);
        }


      }
      else {
        if (!user.isable) return cb(new Error("Baneado"));
        var data = {};
        var first_name = user.first_name;
        var last_name = user.last_name;

        data.email = user.email;
        data.phone = user.phone;
        data.name_u = first_name + " " + last_name;
        data.bono = user.bono;

        cb(null, data);
      }
    },

    function createRequest(data_user, cb) {
      var dateServer = moment(new Date()).locale('es');
      var datePeru = new Date(dateServer.tz('America/Lima').format());
      var requestData = {};
      if (email == 'operador@') {
        requestData.name = name;
        requestData.phone = phone;
        requestData.promotion = false;

        if (!(email_driver == "" || email_driver == null)) {

          requestData.socketid = data_user.socketid;
        }
      }
      else {
        requestData.name = data_user.name_u;
        requestData.phone = data_user.phone;
        if (data_user.bono > 0) { requestData.promotion = true; }
        else { requestData.promotion = false; }
      }
      requestData.email = email;
      requestData.state = false;
      requestData.latitude = latitude;
      requestData.longitude = longitude;
      requestData.gcm_id = gcm;
      requestData.date = datePeru;
      requestData.note = note;
      requestData.address = address;
      requestData.to = to;
      if (price == "") { requestData.price = 0; }
      else { requestData.price = price; }
      if (exactprice == "") { requestData.exactprice = 0; }
      else { requestData.exactprice = exactprice; }
      requestData.ontravel = false;
      requestData.efectivo = false;
      requestData.tipomovil = tipomovil;
      requestData.zona = zona;
      var request = new Request(requestData);
      request.save(function (err, idreq) {
        if (!err) {
          //var a =(String) idreq._id.get("$oid");
          var b = idreq._id.toString();
          //var b = a.toString();
          requestData.id = b;
          requestData.idrequest = b;
          requestData.situation = 1;

          return cb(null, requestData, 1);
        }
        console.log(err.message);
        if (err.message == 'tomado') return cb(err);
        if (err.message == 'actualizar')
          return refreshRequest(requestData, function (err, done) {
            if (err) return cb(err);
            cb(null, requestData, 0);
          });
      });
    },

    function createPeticion(requestData, check, cb) {
      /*
          if(err.message=='actualizar')
                return cb(null, requestData);
        else
          {*/
      if (check == 1) {
        if (email == 'operador@') {
          if (!(email_driver == "" || email_driver == null))
            requestData.generado = 'GOP1';
          else if (data.user == "WHATSAPP")
            requestData.generado = 'GWAPP';
          else
            requestData.generado = 'GOP';

          //añadir buscar peticion de usercentral con el telefono

          UserCentral.findOne({ phone: phone }, {}, function (err, userc) {
            if (userc) {
              requestData.empresa = userc.empresa;
              requestData.area = userc.area;
            }

            var peticion = new Peticion(requestData);
            peticion.save(function (err) {
              return cb(null, requestData);
            });
          });

        }
        else {
          requestData.generado = 'GAPP';
          var peticion = new Peticion(requestData);

          Peticion.update({ email: email, generado: "GAPP", situation: 1 },
            { '$setOnInsert': requestData }, { upsert: true }, function (err, resmongo) {
              if (err) { console.log("error gapp wil"); return cb(err); }

              if (!resmongo.upserted) {
                console.log("no tiene valor el upserted");
                Peticion.findOne({ email: email, generado: "GAPP", situation: 1 }, {}, function (err, midupreq) {
                  requestData.id = midupreq.idrequest;
                  Request.findByIdAndRemove(requestData.idrequest, function (mierr) {
                    if (err) console.log(mierr);
                    return cb(new Error("doblepasajero1"), requestData);
                  });
                });

              }
              else {
                console.log("se genero peticion y se inserto")
                return cb(null, requestData);
              }
            });


        }
      }
      else
        return cb(null, requestData);
    }
  ], function (err, request_data) {
    if (!err) return cbsocket(null, request_data);
    if (err.message == "Baneado") return cbsocket('Baneado');
    if (err.message == "tomado") return cbsocket('Tomado');
    if (err.message == "Noexist") return cbsocket('Noexist');
    if (err.message == "doblepasajero1") return cbsocket('doblepasajero1', request_data);
    cbsocket(err)
  });
};

module.exports.sendRequestSocketoferta = function (data, cbsocket) {

  var latitude = data.latitude;
  var longitude = data.longitude;
  var note = data.note;
  var email = data.email;
  var gcm = data.gcm;
  var address = data.address;
  var to = data.to;
  var price = data.price;
  var exactprice = data.exactprice;
  var phone = data.phone;
  var name = data.name;
  var tipomovil = "";
  var zona = "";
  var email_driver = "";

  email_driver = data.email_driver;

  tipomovil = data.tipomovil;

  zona = " -- ";
  async.waterfall([

    function getUser(cb) {
      User.findOne({ email: email }, {}, function (err, user) {
        if (err) return cb(err);
        if (!user) return cb(new Error("Baneado"));
        cb(null, user);
      });
    },

    function sendUserData(user, cb) {
      if (!user.isable) return cb(new Error("Baneado"));
      var data = {};
      var first_name = user.first_name;
      var last_name = user.last_name;

      data.email = user.email;
      data.phone = user.phone;
      data.name_u = first_name + " " + last_name;
      data.bono = user.bono;
      cb(null, data);
    },
    function createRequest(data_user, cb) {
      var dateServer = moment(new Date()).locale('es');
      var datePeru = new Date(dateServer.tz('America/Lima').format());
      var requestData = {};

      requestData.name = data_user.name_u;
      requestData.phone = data_user.phone;
      if (data_user.bono > 0) { requestData.promotion = true; }
      else { requestData.promotion = false; }

      requestData.email = email;
      requestData.state = false;
      requestData.latitude = latitude;
      requestData.longitude = longitude;
      requestData.gcm_id = gcm;
      requestData.date = datePeru;
      requestData.note = note;
      requestData.address = address;
      requestData.to = to;
      if (price == "") { requestData.price = 0; }
      else { requestData.price = price; }
      if (exactprice == "") { requestData.exactprice = 0; }
      else { requestData.exactprice = exactprice; }
      requestData.ontravel = false;
      requestData.efectivo = false;
      requestData.tipomovil = tipomovil;
      requestData.zona = zona;
      var request = new Request(requestData);
      request.save(function (err, idreq) {
        if (!err) {
          //var a =(String) idreq._id.get("$oid");
          var b = idreq._id.toString();
          //var b = a.toString();
          requestData.id = b;
          requestData.idrequest = b;
          requestData.situation = 1;

          return cb(null, requestData, 1);
        }
        console.log(err.message);
        if (err.message == 'tomado') return cb(err);
        if (err.message == 'actualizar')
          return refreshRequest(requestData, function (err, done) {
            if (err) return cb(err);
            cb(null, requestData);
          });
      });
    }
  ], function (err, request_data) {
    if (!err) return cbsocket(null, request_data);
    if (err.message == "Baneado") return cbsocket('Baneado');
    cbsocket(err)
  });
};
/// --> usado para usar socket desde la operadora
//=======================================================================================================================
//============
module.exports.cancelRequestSocket = function (ide, sit, cb) {

  //  if (email_user == "" || email_driver == "") return cb(new Error('no gcms'));
  async.waterfall([
    function removeRequest(cb) {
      var update = {};
      if (sit == "cancel")
        update.situation = 5;
      else
        update.situation = 4;
      Peticion.findOneAndUpdate({ idrequest: ide }, update, { new: true }, function (err, pedir) {

        /*      var peticionbdcopy=JSON.parse(JSON.stringify(aff));
         delete peticionbdcopy._id;*/
        var peticionbdcopy = clonpeticion(pedir);
        var peticionbd = new PeticionBD(peticionbdcopy);
        peticionbd.save(function (err) {
          console.log(err);
          Request.findOneAndRemove({ _id: ide }, function (err, req) {
            cb(null, pedir);
          });
        });
      });
    },


    function getSocketTaxi(pedir, cb) {
      /*Peticion.findOne({idrequest: ide})
                .select('email_driver')
                .sort({date:-1})
                .limit(1).exec(function(err,pedir){*/
      console.log("en cancelRequestSocket se recibio en pedir los datos:");
      console.log(pedir);
      if (!pedir) pedir.email_driver = "";
      User.findOne({ email: pedir.email_driver }, {}, cb)
      /*});*/

    }], function (err, taxi) {

      if (err) return cb('error', err.message);
      if (!taxi) return cb('taxinotfound');
      cb(null, taxi.socketid);

    });
};

module.exports.ontravel = function (ide, coduni, cb) {
  var options = {};
  options.safe = true;
  options.upsert = true;
  var query = { _id: ide };
  var update = {};
  update.ontravel = true;
  update.dateontravel = new Date();
  update.situation = 3;
  update.email_driver = coduni;
  Request.findOneAndUpdate(query, update, options, function (err, request) {
    if (err) return cb(err);
    Peticion.findOneAndUpdate({ idrequest: ide }, update, { new: true }, function (err, pedir) {
      console.log("----request---")
      console.log(pedir)
      console.log("--------")

      AdminCosto.findOne({ myId: "adminCosto" }, function (err, MiCosto) {
        let costo = pedir.exactprice == 0 ? MiCosto.costo_fijo : pedir.exactprice * MiCosto.porcentaje/100
        let update2 = {
          $inc: { saldoCarreras: -costo },
        };
        User.findOneAndUpdate({ email: coduni }, update2, {}, function (err, miuser) {
          console.log("-------")
          console.log(err);
          console.log(miuser)
          console.log("-------")
        });
        User.findOne({ 'email': pedir.email }, {}, function (err, user) {
          if (err) return cb('error');
          if (!user) return cb(new Error('No existe el usuario'));
          cb(null, user.socketid);
        });
      });



    });
  });
};

module.exports.getOnBoardSocket = function (ide, cb) {
  async.waterfall([
    function findusertaxi(cb) {
      Request.findOneAndRemove({ _id: ide }, function (err, req) {
        if (err) return cb(err);
        if (!req) {
          console.log("Intento de finalizar una peticion ya retirada: ");
          return cb(new Error("ERROR2"));
        }
        cb(null, req);
      });
    },
    function registerPeticion(user, cb) {
      var updatepeticion = {};
      updatepeticion.datearrive = new Date();
      updatepeticion.efectivo = true;
      updatepeticion.star = 5;
      updatepeticion.situation = 4;
      var options = {};
      options.safe = true;
      options.upsert = true;
      //checksit
      Peticion.findOneAndUpdate({ idrequest: ide }, updatepeticion, { new: true },
        function (err, pedir) {
          if (err) return cb(err);
          var peticionbdcopy = clonpeticion(pedir);
          var peticionbd = new PeticionBD(peticionbdcopy);
          peticionbd.save(function (err) {
            console.log(err);
            cb(null, pedir);
          });
        });

    },
    //no se esta considerando el bono ni situation que se considera en socketop
    function getsocket(user, cb) {
      User.findOne({ 'email': user.email }, {}, function (err, user) {
        if (err) return cb('error');
        if (!user) return cb(new Error('No existe el usuario'));
        cb(null, user.socketid);
      });
    }
  ], function (err, socket_user) {
    if (err) return cb('error');
    cb(null, socket_user);
  });
};

module.exports.finanotar = function (ide, coduni, cb) {
  async.waterfall([
    function findusertaxi(cb) {
      Request.findOneAndRemove({ _id: ide }, function (err, req) {
        if (err) return cb(err);
        if (!req) {
          console.log("Intento de finalizar una peticion ya retirada: ");
          return cb(new Error("ERROR2"));
        }
        cb(null, req);
      });
    },
    function registerPeticion(user, cb) {
      var updatepeticion = {};
      updatepeticion.datearrive = new Date();
      updatepeticion.efectivo = true;
      updatepeticion.star = 5;
      updatepeticion.situation = 4;
      updatepeticion.ontravel = true;
      updatepeticion.dateontravel = new Date();
      updatepeticion.email_driver = coduni;
      updatepeticion.state = true;
      updatepeticion.aceptado = "AOP";
      var options = {};
      options.safe = true;
      options.upsert = true;
      //checksit
      Peticion.findOneAndUpdate({ idrequest: ide }, updatepeticion, { new: true },
        function (err, pedir) {
          if (err) return cb(err);
          var peticionbdcopy = clonpeticion(pedir);
          var peticionbd = new PeticionBD(peticionbdcopy);
          peticionbd.save(function (err) {
            console.log(err);
            cb(null, pedir);
          });
        });

    }
  ], function (err, socket_user) {
    if (err) return cb('error');
    cb(null);
  });
};

module.exports.soloanotar = function (data, cbsocket) {

  var latitude = data.latitude;
  var longitude = data.longitude;
  var note = data.note;
  var email = data.email;
  var gcm = data.gcm;
  var address = data.address;
  var to = data.to;
  var price = data.price;
  var exactprice = data.exactprice;
  var phone = data.phone;
  var name = data.name;
  var tipomovil = "";
  var zona = "";
  var email_driver = "";
  if (!(data.email_driver == "" || data.email_driver == null))
    email_driver = data.email_driver;

  if (data.tipomovil == "" || data.tipomovil == null)
    tipomovil = "Cualquiera";
  else
    tipomovil = data.tipomovil;
  if (data.zona == null) { zona = " -- "; }
  else { zona = data.zona; }
  async.waterfall([

    function getUser(cb) {
      cb(null, email);

    },

    function sendUserData(user, cb) {

      cb(null, email);
    },

    function createRequest(data_user, cb) {
      var dateServer = moment(new Date()).locale('es');
      var datePeru = new Date(dateServer.tz('America/Lima').format());
      var requestData = {};

      requestData.name = name;
      requestData.phone = phone;
      requestData.promotion = false;

      requestData.email = email;
      requestData.state = true;
      requestData.latitude = latitude;
      requestData.longitude = longitude;
      requestData.gcm_id = gcm;
      requestData.date = datePeru;
      requestData.note = note;
      requestData.address = address;
      requestData.to = to;
      if (price == "") { requestData.price = 0; }
      else { requestData.price = price; }
      if (exactprice == "") { requestData.exactprice = 0; }
      else { requestData.exactprice = exactprice; }
      requestData.ontravel = false;
      requestData.efectivo = false;
      requestData.tipomovil = tipomovil;
      requestData.zona = zona;
      var request = new Request(requestData);
      request.save(function (err, idreq) {
        if (!err) {
          //var a =(String) idreq._id.get("$oid");
          var b = idreq._id.toString();
          //var b = a.toString();
          requestData.id = b;
          requestData.idrequest = b;
          requestData.situation = 1;

          return cb(null, requestData, 1);
        }
        else {
          console.log(err.message);
          if (err.message == 'tomado') return cb(err);
          if (err.message == 'actualizar')
            cb(null, requestData, 0);
        }

      });
    },

    function createPeticion(requestData, check, cb) {

      if (check == 1) {

        requestData.generado = 'GOP';


        UserCentral.findOne({ phone: phone }, {}, function (err, userc) {
          if (userc) {
            requestData.empresa = userc.empresa;
            requestData.area = userc.area;
          }

          var peticion = new Peticion(requestData);
          peticion.save(function (err) {
            return cb(null, requestData);
          });
        });


      }
      else
        return cb(null, requestData);
    }
  ], function (err, request_data) {
    if (!err) return cbsocket(null, request_data);
    if (err.message == "Baneado") return cbsocket('Baneado');
    if (err.message == "tomado") return cbsocket('Tomado');
    if (err.message == "Noexist") return cbsocket('Noexist')
    cbsocket(err)
  });
};
//No usan un request individual
//=======================================================================================================================
//=======================================================================================================================
module.exports.updatestar = function (req, res) {
  var options = {};
  options.safe = true;
  options.upsert = true;
  var query = { email: req.body.email };
  var updatepeticion = {};
  updatepeticion.noteservice = req.body.noteservice;
  updatepeticion.star = req.body.star;

  Peticion.findOne(query)
    .select('_id')
    .sort({ date: -1 })
    .limit(1).exec(function (err, pedir) {
      if (!pedir) res.sendStatus(200);
      else
        Peticion.findByIdAndUpdate(
          pedir._id, updatepeticion, options,
          function (err, request) {
            if (err) return res.sendStatus(503);
            res.sendStatus(200);
          });
    });
};

module.exports.updatestarPasajero = function (req, res) {
  var options = {};
  options.safe = true;
  options.upsert = true;
  var query = { email_driver: req.body.email_driver };
  var updatepeticion = {};
  updatepeticion.noteservicePasajero = req.body.noteservice;
  updatepeticion.starPasajero = req.body.star;

  Peticion.findOne(query)
    .select('_id')
    .sort({ date: -1 })
    .limit(1).exec(function (err, pedir) {
      if (!pedir) res.sendStatus(200);
      else
        Peticion.findByIdAndUpdate(
          pedir._id, updatepeticion, options,
          function (err, request) {
            if (err) return res.sendStatus(503);
            res.sendStatus(200);
          });
    });
};

module.exports.getRequestList = function (req, res) {

  Request.find({}, {}, function (err, requests) {
    if (err || !requests) return res.sendStatus(503);
    //var emails = _.map(requests,'email');
    //var emails2 = ["alonxogs@gmail.com"];

    //var differencia = _.difference(emails,emails2);
    //var new_requests = _.remove(requests, function(request){
    //  return _.has(request)
    //});
    res.json(requests);
  });
};

module.exports.getUserCentral = function (req, res) {

  UserCentral.findOne({ phone: req.query.phone }, {}, function (err, user) {
    if (err || !user) return res.sendStatus(503);
    //var emails = _.map(requests,'email');
    //var emails2 = ["alonxogs@gmail.com"];

    //var differencia = _.difference(emails,emails2);
    //var new_requests = _.remove(requests, function(request){
    //  return _.has(request)
    //});
    res.json(user);
  });
};


module.exports.sendLocationDriverSocket = function (email, cb) {
  User.findOne({ email: email }, {}, function (err, user) {
    if (err) return cb('error');
    if (!user) return cb('usernotfound');
    /*    var query = {email:datataxi.email};
        var data={};
        data.latitude=datataxi.latitude;
        data.longitude=datataxi.longitude;
        data.email=datataxi.email;
        data.estadoalarma=datataxi.valor;
        User.findOneAndUpdate(query,data,"",function(err,userupdate){*/
    cb(null, user.socketid);
    // });

  })
};

module.exports.saveemergency = function (datataxi, cb) {
  User.findOne({ email: datataxi.email }, {}, function (err, user) {
    if (err) return cb('error');
    if (!user) return cb('usernotfound');
    var query = { email: datataxi.email };
    var data = {};
    data.latitude = datataxi.latitude;
    data.longitude = datataxi.longitude;
    data.email = datataxi.email;
    data.estadoalarma = datataxi.valor;
    User.findOneAndUpdate(query, data, "", function (err, userupdate) {
      cb(null);
    });

  })
};

//req distance, hours, email
module.exports.getcostxdistance = function (req, res) {
  // if (!req.body.email || req.body.email == "") return res.sendStatus(503);
  //hubo problemas enviando directamente el mes asi que se transforma a entero para evitarlo

  Costxdistance.aggregate(
    [
      {
        $project: {

          distanceinf: 1,
          cost: 1,
        }
      },
      { $match: { 'distanceinf': { $lt: req.body.distance } } },

      { $sort: { 'distanceinf': -1 } },
      { $limit: 1 },
    ], function (err, user) {
      if (err) return res.sendStatus(503);
      return res.json(user);
    });
};

//Retorna los datos de l historico de un taxista de un email y un mes especifico
module.exports.getDataHistory = function (req, res) {
  if (!req.query.email || req.query.email == "") return res.sendStatus(503);
  //hubo problemas enviando directamente el mes asi que se transforma a entero para evitarlo
  var mensual = parseInt(req.query.month);
  PeticionBD.aggregate(
    [
      {
        $project: {

          generado: 1,
          email_driver: 1,
          name: 1,
          address: 1,
          phone: 1,
          note: 1,
          promotion: 1,
          date: 1,
          exactprice:1,
          mes: { $month: "$date" }
        }
      },
      { $match: { email_driver: req.query.email } },
      { $match: { mes: mensual } },
      { $sort: { date: -1 } }
    ], function (err, user) {
      if (err) return res.sendStatus(503);
      return res.json(user);
    });
};

module.exports.mapupdatelist = function (cb) {
  var today = moment(new Date()).locale('es');
  //transforma el comienzo  y fin del dia  a hora de lima
  var startday = new Date(today.tz('America/Lima').startOf('day').format());
  var endday = new Date(today.tz('America/Lima').endOf('day').format());
  //console log de estas 3 variables ahi veremos la verdad 
  Peticion.find({ date: { $gt: startday, $lt: endday } }, {}, function (err, pedir) {

    if (err) return cb(err);
    pedir1 = pedir.map(function (obj) {
      obj.date = moment(obj.date).utcOffset('-0500').format('YYYY-MM-DD HH:mm');
      obj.dateontravel = moment(obj.dateontravel).utcOffset('-0500').format('YYYY-MM-DD HH:mm');
      return obj;
    });
    cb(null, pedir1);

  });


};

module.exports.deletepeticiontemp = function () {
  var today = moment(new Date()).locale('es');
  //transforma el comienzo  y fin del dia  a hora de lima
  var startday = new Date(today.tz('America/Lima').startOf('day').format());
  Peticion.find({ date: { $lt: startday } }, {}, function (err, temps) {
    if (temps.length > 0) {

      temps.forEach(function (temp, index, array) {
        temp.remove();
      });
    }
  });
};

module.exports.changenumber = function () {

  UserCentral.find({}, {}, function (err, users) {
    if (users.length > 0) {

      users.forEach(function (user, index, array) {
        if (user.phone.length == 6) {
          user.phone = "054" + user.phone;
          user.save();
        }
      });
    }
  });
};
//el de la bocina o ya llegue
module.exports.arriveSocket = function (email, cb) {
  User.findOne({ 'email': email }, {}, function (err, user) {
    if (err) return cb(err);
    if (!user) return cb(new Error('No User'));
    cb(null, user.socketid);

  });

};


//usado para testear de un post a los proveedores de sms
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
module.exports.testsmsup = function (req, res) {
  var text = 'Akitaxi =P desde smsup API';
  var numbers = '+51 952000243';
  console.log('holas');
  smsup.verificacionSMS(numbers, text, function (err) {
    if (err) return res.sendStatus(503);
    return res.sendStatus(200);
  });
};


module.exports.testtextmagic = function (req, res) {

  var c = new TMClient('wilsoncesarcallisaya', 'Axjx7HqvpWku2mFPTv18ONeJzK8x8Q');
  c.Messages.send({ text: 'Akitaxi =P desde TEXTMAGIC API', phones: '+56956895811' }, function (err, res) {
    console.log('Messages.send()', err, res);
  });
};

module.exports.testinfobip = function (req, res) {
  var text = 'Akitaxi =P desde INFOBIP API';
  var numbers = '+51952000243';
  console.log('holas');
  infobip.verificarSMS(numbers, text, function (err) {
    if (err) return res.sendStatus(503);
    return res.sendStatus(200);
  });
};


//no usado pero para eliminar antes hay que verificar sus llamados de otras ubicaciones de las rutas principalmente
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
module.exports.sendRequest = function (req, res) {

  testGcm(req, function (err, result) {
    if (result.results[0].error) return res.sendStatus(418);//i'm a teapot y no tengo gcm

    async.waterfall([

      function getUser(cb) {
        User.find({ email: req.body.email }, {}, function (err, users) {
          if (err) return cb(err);
          if (!users[0]) return cb(new Error("no existe el usuario"));
          cb(null, users);
        });
      },

      function getAllDrivers(users, cb) {
        req.body.user = users[0];
        User.find({ type: 'taxi' }, {}, cb);
      },

      function sendUserData(drivers, cb) {
        req.body.ids = _.map(drivers, 'gcm_id');
        var user = req.body.user;
        if (!user.isable) return cb(new Error("Baneado"));
        if (!user.checkLogin(req.body.gcm))
          return cb(new Error("el gcm es diferente al registrado"));

        var data = {};
        var first_name = user.first_name;
        var last_name = user.last_name;

        req.body.phone = user.phone;
        req.body.name_u = first_name + " " + last_name;

        data.gcm_user = req.body.gcm;
        data.latitude = req.body.latitude;
        data.longitude = req.body.longitude;
        data.type = '1d';
        cb(null, data);
      },

      function createRequest(data_user, cb) {
        var dateServer = moment(new Date()).locale('es');
        var datePeru = new Date(dateServer.tz('America/Lima').format());

        var requestData = {};
        requestData.state = false;
        requestData.gcm_id = req.body.gcm;
        requestData.name = req.body.name_u;
        requestData.latitude = req.body.latitude;
        requestData.longitude = req.body.longitude;
        requestData.phone = req.body.phone;
        requestData.date = datePeru;
        requestData.note = req.body.note;

        var request = new Request(requestData);

        request.save(function (err) {

          if (!err) return cb(null, 'done');
          if (err.message == 'tomado') return cb(err);
          refreshRequest(requestData, function (err, done) {
            if (err) return cb(err);
            sendPushNotification(data_user, req.body.ids, cb);
          });
        });

      }], function (err, result) {

        if (!err) return res.sendStatus(200);
        if (err.message == "Baneado") return res.sendStatus(500);
        res.status(503).send(err);
      });
  });
};

module.exports.sendLocationDriver = function (req, res) {

  var data = {};
  data.type = '1u';
  data.latitude = req.body.latitude;
  data.longitude = req.body.longitude;
  var email_user = [req.body.email_user];

  sendPushNotification(data, email_user, function (err) {

    if (err) return res.sendStatus(503);
    res.sendStatus(200);
  });
};

module.exports.getRequestListSocket = function (emails_array, cb) {

  Request.find({}, { email: 1, _id: 0 }, function (err, requests) {
    if (err) return cb('error');
    if (!requests) cb('norequests');
    var emails_to_diff = _.map(requests, 'email');

    res.json(requests);
  });
};


module.exports.preCancelRequest = function (req, res) {

  Request.findOneAndRemove({ 'email': req.body.email }, function (err, deleted) {

    if (err) return res.sendStatus(503);
    res.sendStatus(200);
  });
};

module.exports.arrive = function (req, res) {

  var gcm_id = [req.body.gcm_user];
  var data = {};
  data.type = '3u';

  sendPushNotification(data, gcm_id, function (err, result) {

    if (err) return res.sendStatus(503);
    res.sendStatus(200);
  });
};

module.exports.acceptRequest = function (req, res) {
  async.waterfall([

    function noCredit(cb) {
      User.findOne({ 'email': req.body.email_driver }, {}, function (err, taxi) {
        if (err) return cb(err);
        if (!taxi) return res.sendStatus(503);
        if (taxi.credit == 0) return res.sendStatus(418);
        cb(null);
      })
    },

    function findRequest(cb) {
      Request.findOne({ 'email': req.body.email_user }, {}, cb);
    },

    function updateRequest(request, cb) {

      if (!request) return cb(new Error("El pedido no existe"));
      if (request.state) return cb(new Error("ya esta tomado"));
      var update_fields = {};
      update_fields.state = true;
      update_fields.email_driver = req.body.email_driver;
      Request.update({ email: req.body.email_user }, update_fields, {},
        function (err, numberAffected, raw) {
          cb(err, raw);
        });
    },

    function getOneDriver(result, cb) {

      User.findOne({ 'email': req.body.email_driver }, {}, cb);

    },

    function setDataDriver(taxi, cb) {
      if (!taxi) cb(new Error("no existe el taxi"));
      console.log("sendatataxi");

      var data = {};

      data.phone = taxi.phone;
      data.autoplate = taxi.autoplate;
      data.image = taxi.photo_profile;
      data.dni = taxi.dni;
      data.company = taxi.company;
      data.car_brand = taxi.car_brand;
      data.car_model = taxi.car_model;
      data.car_type = taxi.car_type;
      data.car_color = taxi.car_color;
      data.name = taxi.first_name + " " + taxi.last_name;
      data.type = '2u';
      data.email = taxi.email;

      req.body.datadriver = data;
      cb(null, "no push");
      //sendPushNotification(data,user,cb);
    },

    function getUser(result, cb) {

      User.findOne({ 'email': req.body.email_user }, {}, cb);

    }



  ], function (err, result) {
    console.log(err);
    if (err) return res.status(503).send(err.message);
    res.sendStatus(200);
  });
};

module.exports.checkAcceptEmail = function (req, res) {
  Request.findOne({ email_driver: req.body.email }, {}, function (err, request) {
    if (!request) return res.sendStatus(503);
    res.sendStatus(200);
  })
};
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================
//=======================================================================================================================

//Fin de los no usados


//Functions

var sendPushNotification = function (data, reg_ids, cb) {

  var gcmMessage = new gcm.Message({
    delayWhileIdle: true,
    timeToLive: 300,
    dryRun: false,
    data: data
  });
  gcmSender().send(gcmMessage, reg_ids, function (err, message) {
    if (err) return cb(err);
    //if(message.canonical_ids > 0){
    //
    //  //var html = "resultados = " +message.results +
    //  //         "canonical_ids: "+ message.canonical_ids;
    //  var html = JSON.stringify(message) + '<br>';
    //  html += "ids :  "+ reg_ids;
    //  return sendMail2('servicios@akitaxi.com',
    //           'alonxogs@gmail.com',
    //           'Error canonical',
    //           html,function(err,info){
    //             cb(err,message);
    //           });
    //}
    console.log(message);
    cb(null, message);
  });
};

var refreshRequest = function (data, cb) {

  var query = { phone: data.phone };
  Request.findOneAndUpdate(query, data, "", cb);

};

var testGcm = function (req, cb) {
  var data = {};
  data.type = 'test';
  var reg_gcm = [req.body.gcm];
  sendPushNotification(data, reg_gcm, cb);
};

var sendMail = function (from, to, subject, html, cb) {

  var mailOptions = {
    from: from,
    to: to,
    envelope: {
      from: 'servicios@akitaxi.com',
      to: to
    },
    subject: subject,
    html: html
  };

  transport.sendMail(mailOptions, function (error, msg) {
    console.log(error);
    if (error) return cb(error);
    cb(null, msg);
  });

};

var sendMail2 = function (from, to, subject, html, cb) {
  var mailOptions = {

    from: from,
    to: to,
    envelope: {
      from: 'noreply@akitaxi.com',
      to: to
    },
    subject: subject,
    html: html
  };

  transport2.sendMail(mailOptions, function (error, info) {
    if (error) return cb(null);
    cb(null, info);
  });

};

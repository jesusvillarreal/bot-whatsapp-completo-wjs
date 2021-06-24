const fs = require("fs");
const mimeDb = require("mime-db");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const express = require("express");
const moment = require("moment");
const ora = require("ora");
const chalk = require("chalk");
const ExcelJS = require("exceljs");
const qrcode = require("qrcode-terminal");
const { flowConversation } = require("./conversation");
const { Client, MessageMedia } = require("whatsapp-web.js");
var cors = require("cors");
const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
const SESSION_FILE_PATH = "./session.json";
app.use(cors());
let client;
let sessionData;

/**
 * Guardamos archivos multimedia que nuestro cliente nos envie!
 * @param {*} media
 */
const saveMedia = (media) => {
  const extensionProcess = mimeDb[media.mimetype];
  const ext = extensionProcess.extensions[0];
  fs.writeFile(
    `./media/${media.filename}.${ext}`,
    media.data,
    { encoding: "base64" },
    function (err) {
      console.log("** Archivo Media Guardado **");
    }
  );
};

/**
 * Enviamos archivos multimedia a nuestro cliente
 * @param {*} number
 * @param {*} fileName
 */
const sendMedia = (number, fileName) => {
  number = number.replace("@c.us", "");
  number = `${number}@c.us`;
  const media = MessageMedia.fromFilePath(`./mediaSend/${fileName}`);
  client.sendMessage(number, media);
};

/**
 * Enviamos un mensaje simple (mensaje rápido)
 * @param {*} number
 */
const sendMessage = (number = null, text = null) => {
  number = number.replace("@c.us", "");
  number = `${number}@c.us`;
  const message =
    text ||
    `Esto es un mensaje de respuesta rápida. Solo se necesita el numero `;
  client.sendMessage(number, message);
  readChat(number, message);
  console.log(`${chalk.red("Enviando mensajes....")}`);
};

/**
 * Escuchando mensajes
 */
const listenMessage = () => {
  client.on("message", async (msg) => {
    const { from, to, body } = msg;
    console.log(msg.hasMedia);
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      saveMedia(media);
      //
    }

    await greetCustomer(from);

    console.log(body);

    await replyAsk(from, body);

    // await readChat(from, body)
    // console.log(`${chalk.red('⚡⚡⚡ Enviando mensajes....')}`);
    // console.log('Guardar este número en tu Base de Datos:', from);
  });
};

/**
 * Mensaje de Bienvenida
 */

const replyAsk = (from, answer) =>
  new Promise((resolve, reject) => {
    console.log(`---------->`, answer);
    if (answer === "chatbot") {
      sendMessage(from, "Esto es un mensaje de autorespuesta estilo chatbot");
      sendMedia(from, "goku-3.jpg");
      resolve(true);
    }
  });

/**
 * Revisamos si tenemos credenciales guardadas para iniciar session
 * este paso evita volver a escanear el QRCODE
 */
const withSession = () => {
  // Si exsite cargamos el archivo con las credenciales
  const spinner = ora(
    `Cargando ${chalk.yellow("Validando session con Whatsapp...")}`
  );
  sessionData = require(SESSION_FILE_PATH);
  spinner.start();
  client = new Client({
    session: sessionData,
  });

  client.on("ready", () => {
    console.log("Client is ready!");
    spinner.stop();

    // sendMessage();
    // sendMedia();

    connectionReady();
  });

  client.on("auth_failure", () => {
    spinner.stop();
    console.log(
      "** Error de autentificacion vuelve a generar el QRCODE (Borrar el archivo session.json) **"
    );
  });

  client.initialize();
};

/**
 * Generamos un QRCODE para iniciar sesion
 */
const withOutSession = () => {
  console.log("No tenemos session guardada");
  client = new Client();
  client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log("Client is ready!");
    connectionReady();
  });

  client.on("auth_failure", () => {
    console.log("** Error de autentificacion vuelve a generar el QRCODE **");
  });

  client.on("authenticated", (session) => {
    // Guardamos credenciales de de session para usar luego
    sessionData = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
      if (err) {
        console.log(err);
      }
    });
  });

  client.initialize();
};

const connectionReady = () => {
  listenMessage();
  //   readExcel();
};

/**
 * Masivos
 */
// const readExcel = async () => {
//   const pathExcel = `./chats/clientes-saludar.xlsx`;
//   const workbook = new ExcelJS.Workbook();
//   await workbook.xlsx.readFile(pathExcel);
//   const worksheet = workbook.getWorksheet(1);
//   const columnNumbers = worksheet.getColumn("A");
//   columnNumbers.eachCell((cell, rowNumber) => {
//     const numberCustomer = cell.value;

//     const columnDate = worksheet.getRow(rowNumber);
//     let prevDate = columnDate.getCell(2).value;
//     prevDate = moment.unix(prevDate);
//     const diffMinutes = moment().diff(prevDate, "minutes");

//     // Si ha pasado mas de 60 minuitos podemos enviar nuevamente
//     if (diffMinutes > 60) {
//       sendMessage(numberCustomer);
//       columnDate.getCell(2).value = moment().format("X");
//       columnDate.commit();
//     }
//   });

//   workbook.xlsx.writeFile(pathExcel);
// };

/**
 * Guardar historial de conversacion
 * @param {*} number
 * @param {*} message
 */
const readChat = async (number, message) => {
  const pathExcel = `./chats/${number}.xlsx`;
  const workbook = new ExcelJS.Workbook();
  const today = moment().format("DD-MM-YYYY hh:mm");

  if (fs.existsSync(pathExcel)) {
    /**
     * Si existe el archivo de conversacion lo actualizamos
     */
    const workbook = new ExcelJS.Workbook();
    workbook.xlsx.readFile(pathExcel).then(() => {
      const worksheet = workbook.getWorksheet(1);
      const lastRow = worksheet.lastRow;
      var getRowInsert = worksheet.getRow(++lastRow.number);
      getRowInsert.getCell("A").value = today;
      getRowInsert.getCell("B").value = message;
      getRowInsert.commit();
      workbook.xlsx.writeFile(pathExcel);
    });
  } else {
    /**
     * NO existe el archivo de conversacion se crea
     */
    const worksheet = workbook.addWorksheet("Chats");
    worksheet.columns = [
      { header: "Fecha", key: "number_customer" },
      { header: "Mensajes", key: "message" },
    ];
    worksheet.addRow([today, message]);
    workbook.xlsx
      .writeFile(pathExcel)
      .then(() => {
        console.log("saved");
      })
      .catch((err) => {
        console.log("err", err);
      });
  }
};

/**
 * Saludos a primera respuesta
 * @param {*} req
 * @param {*} res
 */

const greetCustomer = (from) =>
  new Promise((resolve, reject) => {
    from = from.replace("@c.us", "");

    const pathExcel = `./chats/${from}@c.us.xlsx`;
    if (!fs.existsSync(pathExcel)) {
      const firstMessage = ["👋 Ey! que pasa bro"].join(" ");

      sendMessage(from, firstMessage);
      sendMedia(from, "goku-2.jpg");
    }
    resolve(true);
  });

/**
 * Controladores
 */

// const sendMessagePost = (req, res) => {
//   const { message, number } = req.body;
//   console.log(message, number);
//   sendMessage(number, message);
//   res.send({ status: "Enviado!" });
// };
const sendMediaPost = (req, res) => {
  const { media, number, message } = req.body;
  console.log(media, number);
  if (message === undefined) {
    sendMedia(number, media);
  } else if (media === undefined) {
    sendMessage(number, message);
  } else {
    sendMedia(number, media);
    sendMessage(number, message);
  }
  console.log(media, number, message);
  res.send({ status: "Enviado!" });
};

/**
 * Rutas
 */

// app.post("/send", sendMessagePost);
app.post("/sendimg", sendMediaPost);

/**
 * Revisamos si existe archivo con credenciales!
 */
fs.existsSync(SESSION_FILE_PATH) ? withSession() : withOutSession();

var PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log("Server ready!", { PORT });
});

app.get("/prueba", (req, res) => {
  res.send("prueba get del chatbot SJT");
});

// Conexión y registro a la base de datosmysql

// var connection = mysql.createConnection({
//   host: "localhost",
//   user: "root",
//   password: "jesus",
//   database: "whatsapp",
// });

// // // Check connection
// connection.connect((error) => {
//   if (error) throw error;
//   console.log("Database running!");
// });

// // app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// app.get("/mensajes", (req, res) => {
//   const sql = "SELECT * FROM message";

//   connection.query(sql, (error, results) => {
//     if (error) throw error;
//     if (results.length > 0) {
//       res.json(results);
//     } else {
//       res.send("Sin resultados");
//     }
//   });

//   // res.send("Lista de mensajes");
// });
// app.get("/mensajes/:id", (req, res) => {
//   const { id } = req.params;
//   const sql = `SELECT * FROM message where IdMessage = ${id}`;

//   connection.query(sql, (error, results) => {
//     if (error) throw error;
//     if (results.length > 0) {
//       res.json(results);
//     } else {
//       res.send("Sin resultados");
//     }
//   });
// });

// app.post("/mensajes/add", (req, res) => {
//   const sql = "INSERT INTO message SET ?";

//   const messageObj = {
//     Phone: req.body.Phone,
//     Message: req.body.Message,
//   };
//   connection.query(sql, messageObj, (error) => {
//     if (error) throw error;
//     res.send("Mensaje creado");
//     // console.log(messageObj);
//     // sendMessage(req.body.Phone, req.body.Message);
//     sendMessage(messageObj.Phone, messageObj.Message);
//   });
// });

// app.put("/mensajes/update/:id", (req, res) => {
//   const { id } = req.params;
//   const { Phone, Message } = req.body;
//   const sql = `UPDATE message SET Phone = '${Phone}', Message = '${Message}'
//     WHERE IdMessage = ${id}`;

//   connection.query(sql, (error) => {
//     if (error) throw error;
//     res.send("Mensaje Actualizado");
//   });
// });

// app.delete("/mensajes/delete/:id", (req, res) => {
//   const { id } = req.params;
//   const sql = `DELETE FROM message WHERE IdMessage = ${id}`;

//   connection.query(sql, (error) => {
//     if (error) throw error;
//     res.send("Mensaje Eliminado");
//   });
// });

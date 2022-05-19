const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const { send } = require('express/lib/response');
require("dotenv").config();
const port = process.env.PORT || 5000

//middleware for rest api .........................
app.use(cors())
app.use(express.json())

//database connection code here....................


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uhic0.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }
  const token = authHeader.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_TOKEN_KEY, function (error, decoded) {
    if (error) {
      return res.status(403).send({ messages: 'Forbidden Access' })
    }
    req.decoded = decoded
    next()
  })
}


async function run() {
  try {
    await client.connect();
    console.log('database connected');
    const serviceCollection = client.db("doctorola").collection('services')
    const userAppointment = client.db("doctorola").collection('appointment')
    const userCollection = client.db("doctorola").collection('users')
    const doctorCollection = client.db("doctorola").collection('doctors')
    const paymentCollection = client.db("doctorola").collection('payments')



    //payment transetion api ................................ 
    app.post('/create-payment-intent', verifyToken, async(req, res) =>{
      const service = req.body;
      const price = service.price;
      const amount = price*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount : amount,
        currency: 'usd',
        payment_method_types:['card']
      });
      res.send({clientSecret: paymentIntent.client_secret})
    });

    //payment update of booking field.................................
    app.patch('/booking/:id', verifyToken, async(req, res) =>{
      const id  = req.params.id;
      const payment = req.body;
      const filter = {_id: ObjectId(id)};
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }

      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await userAppointment.updateOne(filter, updatedDoc);
      res.send(updatedBooking);
    })


    //verify admin without admin user will not able to upload doctor information.......................
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        next();
      }
      else {
        res.status(403).send({ message: 'forbidden' });
      }
    }


    //data sending to ui from mongodb api ....................
    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query)
      const result = await cursor.toArray()
      res.send(result)
    })

    //this api will work for addDoctor dropdown .....................
    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 })
      const result = await cursor.toArray()
      res.send(result)
    })

    //rest api for add doctors user who is admin or not, .......................
    app.post('/doctor', verifyToken, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    //get doctor from database to ui ..................... 
    app.get('/doctor', verifyToken, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    })

    //doctor delete rest api  here....................................
    app.delete('/doctor/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    })

    //user data loading from db to ui dashboard..................
    app.get('/users', verifyToken, async (req, res) => {
      const users = await userCollection.find().toArray()
      res.send(users)
    })


    // rest api for insert new user or update user info when they will login or sign Up from UI.........
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email
      console.log(email)
      const filter = { email: email };
      const user = req.body
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_KEY, { expiresIn: '1h' })
      res.send({ result, token })

    })


    //user is admin or not, checking rest api............................
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin })
    })

    //only admin can make admin user ....................................
    app.put('/user/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const requester = req.decoded.email
      const requesterAccount = await userCollection.findOne({ email: requester })

      if (requesterAccount.role === 'admin') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin' }
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result)
      } else {
        res.status(403).send({ messages: 'Forbidden Access' })
      }
    })


    // app.put('/user/admin/:email', async(req, res)=>{
    //   const email = req.params.email 
    //   const filter = { email: email };
    //   const updateDoc = {
    //     $set: {role: 'admin'}
    //   };
    //   const result = await userCollection.updateOne(filter, updateDoc);  
    //   res.send(result)



    // })

    // PATIENT BOOKING THE SLOTS, REST API................................ 
    app.get('/booking', verifyToken, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email
      if (patient === decodedEmail) {
        const query = { email: patient };
        const bookings = await userAppointment.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: 'Forbiden Access' })
      }

    })
    //payment user api here.........................................
    app.get('/booking/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id)
      const query = { _id: ObjectId(id) };
      console.log(query)
      const booking = await userAppointment.findOne(query);
      res.send(booking);
    })


    // data post from UL to mongodb api.........................
    app.post('/appointment', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
      const exists = await userAppointment.findOne(query)
      if (exists) {
        // console.log(exists);
        return res.send({ success: false, booking: exists })
      }
      const result = await userAppointment.insertOne(booking)
      return res.send({ success: true, result })
    })

    //
    app.get('/available', async (req, res) => {
      const date = req.query.date
      const services = await serviceCollection.find().toArray()

      const query = { date: date }
      const bookings = await userAppointment.find(query).toArray()

      services.forEach(service => {
        const serviceBooking = bookings.filter(book => book.treatment === service.name)
        // console.log(serviceBooking)
        const bookedSlots = serviceBooking.map(book => book.slot)
        // console.log(bookedSlots)
        const available = service.slots.filter(slot => !bookedSlots.includes(slot))
        service.slots = available
      })
      res.send(services)
    })


  } finally {
    //   await client.close();
  }
}
run().catch(console.dir);



// root server api ..............................
app.get('/', (req, res) => {
  res.send('Node server is ready to running............')
})
// app.get('/', (res, req) => {
//   res.json({result : true})
//  })

//app listener for the setting ports...................... 
app.listen(port, () => {
  console.log('Node server is running on the port :: ', port)
})
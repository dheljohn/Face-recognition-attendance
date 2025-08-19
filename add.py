import cv2
import numpy as np
# import face_recognition_models
import face_recognition




imgSarah = face_recognition.load_image_file(r"D:\PycharmProj\Image\Sarah G.jpeg")
imgSarah = cv2.cvtColor(imgSarah, cv2.COLOR_BGR2RGB)

imgTest = face_recognition.load_image_file(r"D:\PycharmProj\Image\Sarah Test.jpg")
imgTest = cv2.cvtColor(imgTest, cv2.COLOR_BGR2RGB)

face_locations = face_recognition.face_locations(imgSarah) [0]
face_encodings = face_recognition.face_encodings(imgSarah) [0]
cv2.rectangle(imgSarah, (face_locations[3],face_locations[0]),(face_locations [1],face_locations[2]), (0, 255, 0), 2)

face_locationTest = face_recognition.face_locations(imgTest) [0]
face_encodingsTest = face_recognition.face_encodings(imgTest) [0]
cv2.rectangle(imgTest, (face_locationTest[3],face_locationTest[0]),(face_locationTest [1],face_locationTest[2]), (0, 255, 0), 2)

results = face_recognition.compare_faces([face_encodings], face_encodingsTest)
face_distances = face_recognition.face_distance([face_encodings], face_encodingsTest)
print(results,face_distances)
cv2.putText(imgTest,f'{results}{round(face_distances[0],2)}',(50,50),cv2.FONT_HERSHEY_SIMPLEX,1,(0,255,0),2)

cv2.imshow("Sarah G", imgSarah)
cv2.imshow("Sarah Test", imgTest)
cv2.waitKey(0)

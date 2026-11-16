resource "aws_vpc" "retail" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "retaildemostore-vpc"
  }
}

resource "aws_internet_gateway" "retail" {
  vpc_id = aws_vpc.retail.id

  tags = {
    Name = "retaildemostore-igw"
  }
}

resource "aws_subnet" "public_1" {
  vpc_id                  = aws_vpc.retail.id
  cidr_block              = "10.0.0.0/24"
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = true

  tags = {
    Name = "retaildemostore-public-1"
  }
}

resource "aws_subnet" "public_2" {
  vpc_id                  = aws_vpc.retail.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "us-east-1b"
  map_public_ip_on_launch = true

  tags = {
    Name = "retaildemostore-public-2"
  }
}

resource "aws_subnet" "private_1" {
  vpc_id                  = aws_vpc.retail.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = false

  tags = {
    Name = "retaildemostore-private-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id                  = aws_vpc.retail.id
  cidr_block              = "10.0.3.0/24"
  availability_zone       = "us-east-1b"
  map_public_ip_on_launch = false

  tags = {
    Name = "retaildemostore-private-2"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.retail.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.retail.id
  }

  tags = {
    Name = "retaildemostore-public-rt"
  }
}

resource "aws_route_table_association" "public_1" {
  subnet_id      = aws_subnet.public_1.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_2" {
  subnet_id      = aws_subnet.public_2.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat_1" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.retail]
}

resource "aws_eip" "nat_2" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.retail]
}

resource "aws_nat_gateway" "nat_1" {
  allocation_id = aws_eip.nat_1.id
  subnet_id     = aws_subnet.public_1.id

  tags = {
    Name = "retaildemostore-nat-1"
  }
}

resource "aws_nat_gateway" "nat_2" {
  allocation_id = aws_eip.nat_2.id
  subnet_id     = aws_subnet.public_2.id

  tags = {
    Name = "retaildemostore-nat-2"
  }
}

resource "aws_route_table" "private_1" {
  vpc_id = aws_vpc.retail.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat_1.id
  }

  tags = {
    Name = "retaildemostore-private-rt-1"
  }
}

resource "aws_route_table" "private_2" {
  vpc_id = aws_vpc.retail.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat_2.id
  }

  tags = {
    Name = "retaildemostore-private-rt-2"
  }
}

resource "aws_route_table_association" "private_1" {
  subnet_id      = aws_subnet.private_1.id
  route_table_id = aws_route_table.private_1.id
}

resource "aws_route_table_association" "private_2" {
  subnet_id      = aws_subnet.private_2.id
  route_table_id = aws_route_table.private_2.id
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.retail.id
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private_1.id, aws_route_table.private_2.id]

  tags = {
    Name = "retaildemostore-s3-endpoint"
  }
}
